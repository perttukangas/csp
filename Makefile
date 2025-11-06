# Define the base directory - can be overridden when running make
BASE_DIR ?= .

all:
	curl -X POST http://localhost:8000/api/process -H "Content-Type: application/json" -d "{\"urls\": [{\"url\": \"https://varuste.net/lajit\"}, {\"url\": \"https://varusteleka.com/collections/vaatteet\"}], \"prompt\": \"Extract different product categories in csv\"}"

test-html:
	@echo "Creating JSON payload..."; \
	temp_file=$$(mktemp); \
	jq -n \
		--rawfile first_html "$(BASE_DIR)/test/first_html.html" \
		--rawfile second_html "$(BASE_DIR)/test/second_html.html" \
		'{htmls: [{html: $$first_html}, {html: $$second_html}], urls: [], prompt: "Extract different products with their prices and brands into csv"}' > "$$temp_file"; \
	echo "Sending request to localhost:8000..."; \
	curl -X POST http://localhost:8000/api/process \
		-H "Content-Type: application/json" \
		-d @"$$temp_file"; \
	rm "$$temp_file"

