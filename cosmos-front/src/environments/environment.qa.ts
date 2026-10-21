// Ambiente de QA en Azure: el panel vive en Static Web Apps (plan Free, sin
// proxy /api) y llama a la API por su propio dominio, con CORS.
export const environment = {
    production: true,
    api: 'https://api-qa.cosmos.com.pe/api/v1'
};
