# Language + Localization Guardrails for AT Websites

Screen readers pronounce content based on the declared language. If the language
metadata is wrong or missing, the screen reader uses the wrong voice and pronunciation
-- making content unintelligible instead of accessible.

This guide adds language-aware guardrails for AT web projects.

**Source:** Internal development experience, standard web accessibility requirements
for language metadata.

## Baseline requirements

1. **App shell MUST set an accurate `lang` on the root document**

```html
<html lang="[CONFIGURE: primary language, e.g., en]">
```

2. **Mixed-language content SHOULD mark language changes where feasible**
   (project-configurable)

```html
<p>The French term <span lang="fr">mise en place</span> means...</p>
```

3. **Avoid hard-coded language assumptions** in UI strings and validation messages

## Content + data requirements (for scrapers/directories)

If your AT project involves scraping, aggregating, or displaying content from external
sources:

- Store language metadata per item when ingesting scraped content (when available)
- Provide a way to filter or at least display the content language in UI (if
  multilingual)

### Project-specific configuration

- **Primary language:** `[CONFIGURE: e.g., en]`
- **Multilingual content:** `[CONFIGURE: yes/no -- if yes, how is language metadata stored?]`
- **Language detection approach:** `[CONFIGURE: e.g., manual tagging, source metadata, automated detection]`

## Verification evidence

- Manual screen reader spot-check: primary language is announced correctly;
  mixed-language content does not become unintelligible
- Check that the root `<html>` element has the correct `lang` attribute
- For multilingual content: verify that language-switched sections are announced
  in the correct voice

## Checklist (for PR descriptions)

```markdown
### Language + i18n check

- [ ] Root `<html>` has correct `lang` attribute
- [ ] Mixed-language content tagged with `lang` where feasible
- [ ] No hard-coded language assumptions in UI strings
- [ ] Screen reader uses correct voice for primary language
- [ ] Mixed-language content doesn't break screen reader pronunciation
```
