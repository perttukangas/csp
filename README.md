# Computer Science Project

- Browser Extension ( Artjom, Perttu )
  - JS/TS
  - Take into account multiple browsers: firefox, chrome
  - Plasmo(?), WXT(?)
  - 1) Write prompt
       What you want to scrape / find?
       Include the output format? e.g. csv
    2) Press some "Start" -button
    3) Extension starts storing pages (url)
    4) Press "Stop" -button
    5) Validating the stored pages
    6) Send them to the backend
    7) Backend sends the data

- Backend ( Mohammed, Kimmo )
  - Python, UV, dockerize
  - Agent
    1) Base prompt for the agent "you are x, your job is to y", here is the user prompt and URLs. Here are the tools etc etc
    2) Tools ( Dennis )
       Scrapy lib with basic html scraping, just specific elements
       Output to specified format
  - Gemini API token
