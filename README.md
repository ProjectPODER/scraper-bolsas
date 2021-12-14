# scraper-bolsas

Scraper for some stock exchange websites in Latin America and Spain.

### Usage

    node index.js -c [SCRAPER]

### Output

3 files consisting of JSON lines:

*  data/[SCRAPER]-companies.json
*  data/[SCRAPER]-memberships.json
*  data/[SCRAPER]-persons.json

### Notes

** Bolivia: ** this scraper attempts to parse PDFs, but conversion and results are inconsistent.
