# Architecture notes

External response formats are confined to `backend/src/data-sources`. Mappers in that boundary will convert provider-specific data into application-level domain types before it reaches the rest of the backend.

- [DRNA source analysis](drna-source-analysis.md)
- [Offline DRNA municipalities](drna-municipalities.md)
- [NWS source validation](nws-source-analysis.md)

