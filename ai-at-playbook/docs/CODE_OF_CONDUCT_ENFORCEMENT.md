# Code of Conduct Enforcement

Minimum enforcement requirements for AI-assisted open source projects. Having a Code
of Conduct file is not enough -- you need reporting channels and response expectations.

## Code of conduct enforcement minimum

1. **Publish clear private reporting channels** -- an email address or form where
   people can report CoC violations without public exposure
2. **Define an alternate contact** when the reporter's concern involves the primary
   recipient (e.g., if the report is about the lead maintainer, there must be someone
   else to receive it)
3. **Define response expectations** -- how quickly reports are acknowledged, how
   investigations work, what enforcement steps are available
4. **Require AI-generated communication to follow project conduct language standards** --
   AI-generated issue comments, PR descriptions, and documentation must not use
   language that violates the CoC

## AI-specific conduct considerations

- AI-generated content can inadvertently use exclusionary language, make assumptions
  about ability or background, or use gendered pronouns inappropriately
- AI tools may generate responses that sound authoritative but violate community norms
  (e.g., closing an issue with a dismissive AI-generated explanation)
- AI should NEVER moderate CoC violations directly -- flag for human review instead

## Enforcement template

```markdown
## Reporting

If you experience or witness behavior that violates our Code of Conduct, please
contact [CONFIGURE: primary contact email].

If your concern involves the primary contact, please reach
[CONFIGURE: alternate contact email].

## Response expectations

- Reports are acknowledged within [CONFIGURE: e.g., 48 hours]
- Investigation begins within [CONFIGURE: e.g., 1 week]
- Outcomes are communicated to the reporter

## Enforcement actions

Actions may include:
- A private conversation with the person involved
- A request for a public apology
- A temporary ban from project spaces
- A permanent ban from project spaces

The severity of the action matches the severity of the behavior.
```

### Project-specific configuration

- **Code of Conduct file:** `[CONFIGURE: path, e.g., CODE_OF_CONDUCT.md]`
- **Primary enforcement contact:** `[CONFIGURE: email or form URL]`
- **Alternate contact:** `[CONFIGURE: email or form URL for when the primary is involved]`
- **Response time target:** `[CONFIGURE: e.g., acknowledge within 48 hours]`
