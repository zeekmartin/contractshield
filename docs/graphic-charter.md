# Graphic Charter (Docs & UI)

Date: 2026-01-14

This project values clarity over ornamentation. Use a calm, technical style.

## Voice & tone
- Direct, calm, professional.
- Avoid fear marketing; focus on verifiable controls.
- Prefer "reject unexpected inputs" over "block hackers".

## Documentation style
- Headings: sentence case.
- Use short paragraphs and bullets.
- Include examples (JSON/YAML) and expected outputs.
- Always mention default mode (monitor vs enforce).

## Naming conventions
- Components: **PEP**, **PDP**, **PAP**
- Objects: `RequestContext`, `Decision`, `Policy`
- Rules: `category.subcategory.name` (e.g., `limit.body.max`)

## Error message style
- Client-facing: generic + correlation id.
- Server logs: detailed rule hits + redactions.
