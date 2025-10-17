"""
Integration test script for the Gemini agent

This is an integration test that requires:
1. The server to be running (uv run uvicorn app.main:app --reload)
2. A valid GEMINI_API_KEY in the .env file

This file is renamed to integration_test_* so it won't be automatically
picked up by pytest. To run it manually:
  python tests/integration_test_gemini_agent.py

For unit tests, see test_gemini_service.py
"""

import requests

# Test data
test_html = """
<html>
<body>
    <div class="product-card">
        <h1 class="product-title">Wireless Headphones</h1>
        <span class="price" data-price="79.99">$79.99</span>
        <div class="rating">
            <span class="stars">★★★★☆</span>
            <span class="review-count">(234 reviews)</span>
        </div>
        <p class="description">
            High-quality wireless headphones with noise cancellation
        </p>
        <button class="add-to-cart">Add to Cart</button>
    </div>
</body>
</html>
"""

test_request = {
    'url': 'https://example.com/products/headphones',
    'content': test_html,
    'input_format': 'html',
    'user_request': 'Extract the product title, price, rating stars, review count, and description',
    'output_format': 'both',
}


def test_health_check():
    """Test the health check endpoint"""
    print('Testing health check endpoint...')
    try:
        response = requests.get('http://localhost:8000/scrape/health')
        print(f'Status Code: {response.status_code}')
        print(f'Response: {response.json()}')
        print('✅ Health check passed\n')
        return True
    except Exception as e:
        print(f'❌ Health check failed: {e}\n')
        return False


def test_generate_selectors():
    """Test the generate selectors endpoint"""
    print('Testing generate selectors endpoint...')
    print(f'Request: {test_request}\n')

    try:
        response = requests.post('http://localhost:8000/scrape/generate-selectors', json=test_request)

        print(f'Status Code: {response.status_code}')

        if response.status_code == 200:
            data = response.json()
            print('\n✅ Success! Generated selectors:')
            print(f'URL: {data["url"]}')
            print('\nSelectors:')
            for field_name, selectors in data['selectors'].items():
                print(f'\n  {field_name}:')
                if selectors.get('xpath'):
                    print(f'    XPath: {selectors["xpath"]}')
                if selectors.get('css'):
                    print(f'    CSS:   {selectors["css"]}')

            if data.get('raw_output'):
                print(f'\nRaw AI Output:\n{data["raw_output"][:200]}...')

            return True
        else:
            print(f'❌ Request failed: {response.json()}')
            return False

    except Exception as e:
        print(f'❌ Test failed: {e}')
        return False


def test_xpath_only():
    """Test with XPath output only"""
    print('\n' + '=' * 60)
    print('Testing XPath-only output...')

    request = test_request.copy()
    request['output_format'] = 'xpath'
    request['user_request'] = 'Extract product title and price'

    try:
        response = requests.post('http://localhost:8000/scrape/generate-selectors', json=request)

        if response.status_code == 200:
            data = response.json()
            print('✅ XPath-only test passed')
            print('Selectors:')
            for field_name, selectors in data['selectors'].items():
                print(f'  {field_name}: {selectors.get("xpath")}')
            return True
        else:
            print(f'❌ XPath-only test failed: {response.json()}')
            return False

    except Exception as e:
        print(f'❌ XPath-only test failed: {e}')
        return False


def test_css_only():
    """Test with CSS output only"""
    print('\n' + '=' * 60)
    print('Testing CSS-only output...')

    request = test_request.copy()
    request['output_format'] = 'css'
    request['user_request'] = 'Extract product title and price'

    try:
        response = requests.post('http://localhost:8000/scrape/generate-selectors', json=request)

        if response.status_code == 200:
            data = response.json()
            print('✅ CSS-only test passed')
            print('Selectors:')
            for field_name, selectors in data['selectors'].items():
                print(f'  {field_name}: {selectors.get("css")}')
            return True
        else:
            print(f'❌ CSS-only test failed: {response.json()}')
            return False

    except Exception as e:
        print(f'❌ CSS-only test failed: {e}')
        return False


if __name__ == '__main__':
    print('=' * 60)
    print('Gemini Agent Test Suite')
    print('=' * 60)
    print('\nMake sure the server is running:')
    print('  uv run uvicorn app.main:app --reload')
    print('\nAnd that you have set GEMINI_API_KEY in .env file')
    print('=' * 60 + '\n')

    results = []

    # Run tests
    results.append(('Health Check', test_health_check()))

    if results[0][1]:  # Only continue if health check passed
        results.append(('Generate Selectors (Both)', test_generate_selectors()))
        results.append(('XPath Only', test_xpath_only()))
        results.append(('CSS Only', test_css_only()))

    # Summary
    print('\n' + '=' * 60)
    print('Test Summary')
    print('=' * 60)
    for test_name, passed in results:
        status = '✅ PASSED' if passed else '❌ FAILED'
        print(f'{test_name}: {status}')

    total_passed = sum(1 for _, passed in results if passed)
    print(f'\nTotal: {total_passed}/{len(results)} tests passed')
    print('=' * 60)
