# scraper-bolsas
Scraper de las bolsas de valores de Latinoamérica y España

### Usage

    node index.js -c [SCRAPER]

### Output

3 archivos de JSON lines:

*  data/[SCRAPER]-companies.json
*  data/[SCRAPER]-memberships.json
*  data/[SCRAPER]-persons.json

### Notas

** Bolivia: ** este scraper intenta parsear PDFs, pero la conversión y los resultados son inconsistentes.
