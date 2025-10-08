# Computer Science Project

- [Development Diary](docs/development-diary.md)

Backend endpoint

"/api/process"
Input:

```json
{
  "urls": [
    {
      "url": "string"
    }
  ],
  "prompt": "string"
}
```

Example curl command:

```bash
curl -X POST http://localhost:8000/api/process \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      {"url": "https://varuste.net/lajit"},
      {"url": "https://varusteleka.com/collections/vaatteet"}
    ],
    "prompt": "Extract different product categories in csv"
  }'
```


Output:

```
plain text = actual data

|product name|price|
|jacket|10$|
|jacket2|10$|
```