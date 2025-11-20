# test_dummy_run.py

import json
from app.models.scrape import ScrapeRequest, InputFormat, OutputFormat
from app.services.gemini_agent import get_gemini_service


def run_dummy_test():
    # Replace with ANY website you want
    test_url = "https://example.com"

    # Minimal HTML for testing (no actual scraping needed)
    dummy_html = """
    <html>
        <body>
            <h1>Example Domain</h1>
            <p>This is a dummy test.</p>
        </body>
    </html>
    """

    # Your prompt – replace with anything you want
    user_prompt = "Extract the page title."

    req = ScrapeRequest(
        url=test_url,
        input_format=InputFormat.HTML,
        output_format=OutputFormat.XPATH,
        content=dummy_html,
        user_request=user_prompt,
        crawl=False,
    )

    service = get_gemini_service()

    try:
        result = service.generate_selectors(
            request=req,
            validation_fail_reasoning="",
            max_validations=5
        )
        print("RAW OUTPUT:")
        print(result.raw_output)
        print("\nSELECTORS:")
        print(result.selectors)

    except Exception as e:
        print("\n❌ ERROR DURING DUMMY RUN")
        print(e)


if __name__ == "__main__":
    run_dummy_test()
