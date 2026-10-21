## Approach & Efficiency (Token-Efficient Strategy)
- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output. Write complete solutions.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff. No "Sure!", "Great question!".
- No emojis or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.

## Agents & Skills (Project Cosmos)

### Frontend Agent (Angular)
- **Phase Out PrimeNG:** Any modified component must be refactored to remove PrimeNG dependencies, using native HTML/CSS while strictly maintaining the established graphical line.
- **Enforce Design Consistency:** Maintain the established UI/UX guidelines (vibrant colors, modern typography, responsive dynamic layouts, premium aesthetics).
- **Skill - State Management & Services:** Ensure APIs are consumed correctly through dedicated Angular services. Keep components lean.
- **Skill - Performance:** Ensure efficient DOM updates and use structural directives effectively. Keep bundle size minimal by avoiding heavy third-party UI libraries like PrimeNG.

### Backend Agent (NestJS)
- **Skill - High Performance:** Ensure NestJS runs with SWC builder for faster compilation and execution. Maintain token-efficient responses during debugging.
- **Skill - Database Management:** Use Mongoose effectively with clearly defined schemas and TypeScript interfaces.
- **Skill - Security & Validations:** Apply strict validations using class-validator and DTOs.
- **Skill - Environment Configuration:** Correctly map and utilize environment variables (e.g., DNS configurations, DB URIs) directly from .env without hardcoding values.
