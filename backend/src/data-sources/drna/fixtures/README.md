# DRNA Test Fixtures

These fixtures are small, manually trimmed samples of official DRNA Beach Monitoring and Public Notification Program publications. They exist for deterministic parser and mapper tests; they are not a complete historical dataset.

Retrieved: October 3, 2026.

## Files

- `notification-advisory.html`: notification with one station above the Beach Action Value.
- `notification-all-clear.html`: notification stating that monitored beaches were suitable for bathers.
- `monitoring-results-extracted.txt`: representative rows from a detailed results attachment, including a numeric result, a qualified `<10` result, and a resampling row with missing fields.

## Sources

- Notification archive: <https://www.drna.pr.gov/cat/programas-y-proyectos/monitoria-de-playas/notificaciones-ambientales/>
- Advisory example: <https://www.drna.pr.gov/programas-y-proyectos/monitoria-de-playas/notificaciones-ambientales/notificacion-monitoria-de-playas-269/>
- All-clear example: <https://www.drna.pr.gov/programas-y-proyectos/monitoria-de-playas/notificaciones-ambientales/notificacion-monitoria-de-playas-258/>
- Detailed results example: <https://www.drna.pr.gov/wp-content/uploads/2026/09/Monitoria-de-playas-25-de-Septiembre-de-2026.pdf>

## Fixture policy

The HTML files retain only the semantic content needed by tests rather than the DRNA site's theme, navigation, scripts, or tracking markup. The text fixture uses pipe-separated columns to preserve values extracted from the PDF while making page-layout irregularities explicit.

When DRNA changes its publication format, add a new fixture rather than silently rewriting an existing fixture that represents a previously observed format.
