import json

from google import genai
from google.genai import types

from pydantic import BaseModel, Field


from app.core.config import settings
from app.models.scrape import InputFormat, OutputFormat, ScrapeRequest, ScrapeResponse, ProcessRequest, ModelResponse
from app.services.agent_tools import fetch_with_selectors
# ------------------------------------------------------------
# 🔹 Helper functions for prompt text
# ------------------------------------------------------------


def get_base_prompt() -> str:
    """Base instructions for Gemini – defines its role and task."""

    return """You are an expert web scraping AI agent that generates precise selectors from HTML/DOM content.

You will receive:
  - A URL (for context)
  - HTML content or a DOM tree
  - A natural language request describing what data to extract

Your tasks:
  1. Carefully analyze the HTML/DOM structure to generate draft selectors.
  2. **VALIDATE YOUR WORK**: You MUST use the `fetch_with_selectors` tool to test your draft selectors against the URL.
  3. **ANALYZE RESULTS**:
     - If the tool returns data that matches the user's request, you are done.
     - If the tool returns empty lists, errors, or incorrect data, you MUST refine your selectors and call `fetch_with_selectors` again.
  4. **SUBMIT FINAL ANSWER**: Once you have validated your selectors and they work correctly, you MUST call the `submit_final_selectors` tool with the final, working JSON.

Rules:
  - Convert field names to snake_case (e.g., 'Product Name' → 'product_name').
  - Use only XPath 1.0 syntax.
  - Do not return the final answer as text. Only use the `submit_final_selectors` tool.
"""


def get_format_instructions(fmt: OutputFormat) -> str:
    """Returns format-specific output instructions for the selector type."""

    return """Output Format:
    Return ONLY valid JSON in this exact schema (no markdown, no explanations):
    {
      "selectors": {
        "<field_name>": {
          "xpath": "<xpath_selector>"
        }
      }
    }

    XPath Guidelines:
    - Use only XPath 1.0 syntax (no XPath 2.0+ functions like matches(), tokenize(), etc.)
    - Use absolute paths sparingly; prefer relative paths with meaningful attributes
    - Use text() for text content, @attribute for attributes
    - Prefer class names and IDs when stable
    - Use contains() for partial matches when appropriate
    - For case-insensitive matching, use translate() function to normalize case
    """


def get_analysis_instructions() -> str:
    """Returns instructions for analysis-only mode."""
    return """You are an expert web scraping AI agent that extracts structured data from HTML/DOM content.

    You will receive:
    - A URL (for context)
    - HTML content or a DOM tree
    - A natural language request describing what data to extract

    Your tasks:
    1. Analyze the HTML/DOM structure carefully.
    2. Identify all elements matching the user's request.
    3. Extract the data into a structured, tabular JSON array suitable for CSV conversion.

    Output Format:
    Return ONLY valid JSON in this format (no markdown, no explanations):
    [
    {
        "column_1": "value",
        "column_2": "value",
        ...
    },
    ...
    ]

    Rules:
    - Use snake_case for keys.
    - Ensure all records share the same set of keys.
    - Exclude empty or null entries.
    """

def pydantic_to_google_schema(model: type[BaseModel]) -> types.Schema:
    """Converts a Pydantic model to a Google GenAI Schema."""
    return types.Schema.from_dict(model.model_json_schema())
# ------------------------------------------------------------
# 🔹 Main service class
# ------------------------------------------------------------


class GeminiAgentService:
    """Service that interacts with Gemini to generate web scraping selectors."""

    def __init__(self):
        if not settings.gemini_api_key:
            raise ValueError('GEMINI_API_KEY is not configured. Please set it in your .env file.')
        
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model_name = 'models/gemini-2.5-flash'

        # 🔹 UPDATED: Define tools using Pydantic's .model_json_schema()
        
        # 1. Schema for the validation tool
        fetch_tool_decl = {
            "name": "fetch_with_selectors",
            "description": "Fetches a URL and runs XPath selectors to validate them. Returns the extracted data.",
            "parameters": BaseModel.model_config_create_json_schema(
                                {
                                    'url': (str, ...),
                                    'selectors': (dict[str, str], ...),
                                },
                            )
        }
        
        # 2. Schema for the final submission tool (uses our Pydantic model)
        submit_tool_decl = {
            "name": "submit_final_selectors",
            "description": "Submits the final, validated selectors when the task is complete.",
            "parameters": ModelResponse.model_json_schema() # <-- Much cleaner!
        }

        # 3. Create the tools list
        self.tools = [types.Tool(function_declarations=[fetch_tool_decl, submit_tool_decl])]
    # -----------------------------
    # Prompt construction
    # -----------------------------

    def _build_system_prompt(self, request: ScrapeRequest) -> types.Content:
        full_prompt = get_base_prompt()
        if request.crawl:
            full_prompt += "\n\nCrawling Instructions:\n- When generating selectors, consider that the page may be crawled to additional depths. If so, ensure selectors remain valid for linked pages and generate an additional selector with the name 'next_page_selector'."
        return types.Content(parts=[types.Part(text=full_prompt)], role='user') # System prompt is just a 'user' role first turn

    def _build_user_prompt(self, request: ScrapeRequest) -> types.Content:
        """Builds the user prompt based on the given scrape request."""
        input_type = 'HTML content' if request.input_format == InputFormat.HTML else 'DOM tree'

        prompt = f"""URL: {request.url}

        Input Type: {input_type}

        Content:
        {request.content}

        User Request: {request.user_request}

        Generate the selectors now. Return ONLY the JSON output, no other text.
        """
        return types.Content(parts=[types.Part(text=prompt)])

    def _build_validator_prompt(self, validation_fail_reasoning: str) -> types.Content:
        """Builds the prompt from the validation agent."""
        if not validation_fail_reasoning:
            return types.Content(parts=[types.Part(text='')])

        prompt = f"""The previous generation was not satisfactory.

Reasoning: {validation_fail_reasoning}
"""
        return types.Content(parts=[types.Part(text=prompt)])

    # -----------------------------
    # Response parsing
    # -----------------------------

    @staticmethod
    def _parse_gemini_response(response_text: str) -> dict:
        """Parses and validates the JSON response from Gemini."""
        try:
            parsed = json.loads(response_text)
        except json.JSONDecodeError as e:
            raise ValueError(f'Invalid JSON in Gemini response: {e}\nRaw output:\n{response_text}') from e
        if 'selectors' not in parsed:
            raise ValueError(f'Missing key "selectors" in response.\nRaw output:\n{response_text}')
        return parsed

    # -----------------------------
    # Main function: generation
    # -----------------------------
    def analyze_and_extract(self, request: ScrapeRequest) -> ScrapeResponse:
        """Calls Gemini to analyze the page and extract structured data directly."""
        system_prompt = types.Content(parts=[types.Part(text=get_analysis_instructions())], role='user')
        user_prompt = self._build_user_prompt(request)

        # 🔹 UPDATED: Define schema as a dict, per documentation
        # This schema allows a list ([]) of any objects ({})
        flexible_analysis_schema = {
            "type": "ARRAY",
            "items": {"type": "OBJECT"}
        }

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[system_prompt, user_prompt],
                generation_config=types.GenerationConfig(
                    response_mime_type='application/json',
                    response_schema=flexible_analysis_schema, # <-- Pass the dict directly
                ),
            )
            raw_output = response.text
        except Exception as e:
            raise RuntimeError(f'Gemini API call failed: {e}') from e

        try:
            parsed_data = json.loads(raw_output)
            if not isinstance(parsed_data, list):
                raise ValueError('Gemini output must be a JSON list of records.')
        except json.JSONDecodeError as e:
            raise ValueError(f'Invalid JSON in Gemini response: {e}\nRaw output:\n{raw_output}') from e

        return ScrapeResponse(
            url=request.url,
            selectors=None,
            raw_output=raw_output,
            extracted_data=parsed_data,
        )


    def generate_selectors(
        self, request: ScrapeRequest, validation_fail_reasoning: str, max_retries: int = 5
    ) -> ScrapeResponse:
        """Calls Gemini and uses a tool-calling loop to validate selectors."""
        
        system_prompt = self._build_system_prompt(request)
        user_prompt = self._build_user_prompt(request)
        validated_prompt = self._build_validator_prompt(validation_fail_reasoning)
        
        history = [system_prompt, user_prompt, validated_prompt]
        
        for _ in range(max_retries):
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=history,
                    tools=self.tools
                )
                
                part = response.candidates[0].content.parts[0]
                
                if part.function_call and part.function_call.name == 'submit_final_selectors':
                    print("Gemini is submitting final selectors.")
                    args_dict = types.FunctionCall.to_dict(part.function_call)
                    
                    model_response = ModelResponse.model_validate(args_dict['args'])
                    
                    final_selectors = {
                        name: Selectors(xpath=data.xpath) 
                        for name, data in model_response.selectors.items()
                    }
                    
                    return ScrapeResponse(
                        url=request.url, 
                        selectors=final_selectors, 
                        raw_output=json.dumps(args_dict),
                        extracted_data=None
                    )

                elif part.function_call and part.function_call.name == 'fetch_with_selectors':
                    print("Gemini is validating selectors...")
                    args_dict = types.FunctionCall.to_dict(part.function_call)['args']
                    
                    url_to_fetch = args_dict.get('url', request.url)
                    selectors_to_fetch = args_dict.get('selectors', {})
                    
                    extracted_data = fetch_with_selectors(url_to_fetch, selectors_to_fetch)
                    
                    # Append the model's request to history
                    history.append(response.candidates[0].content)
                    
                    # 🔹 UPDATED: Append the function's result using the SDK helper
                    # This is much cleaner and removes the need for protobuf
                    history.append(types.Content(
                        role="user", 
                        parts=[types.Part.from_function_response(
                            name='fetch_with_selectors',
                            response=extracted_data # Pass the Python dict directly
                        )]
                    ))
                    
                else:
                    raise RuntimeError(f"Model did not call a function. Raw output: {part.text}")

            except (Exception, ValidationError) as e:
                raise RuntimeError(f'Gemini API call or validation failed: {e}') from e

        raise RuntimeError(f'Failed to generate and validate selectors after {max_retries} attempts.')

    def validate_and_refine_selectors(self, validation_prompt: str) -> dict:
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[validation_prompt],
                config=types.GenerateContentConfig(response_mime_type='application/json'),
            )
            return json.loads(response.text)
        except (Exception, json.JSONDecodeError) as e:
            print(f'Validation agent call or JSON parsing failed: {e}')
            return {'decision': 'GOOD', 'reasoning': 'Validation agent failed, skipping refinement.'}


# ------------------------------------------------------------
# 🔹 Singleton instance
# ------------------------------------------------------------

_gemini_service: GeminiAgentService | None = None


def get_gemini_service() -> GeminiAgentService:
    """Returns a singleton instance (only one Gemini service per app)."""
    global _gemini_service
    if _gemini_service is None:
        _gemini_service = GeminiAgentService()
    return _gemini_service
