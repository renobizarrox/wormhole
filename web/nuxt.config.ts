// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: [
    'vuetify-nuxt-module',
    '@nuxtjs/apollo',
    '@pinia/nuxt',
  ],
  vuetify: {
    vuetifyOptions: {
      theme: {
        defaultTheme: 'light',
        themes: {
          light: {
            colors: {
              primary: '#1976D2',
              secondary: '#424242',
              accent: '#82B1FF',
              error: '#FF5252',
              info: '#2196F3',
              success: '#4CAF50',
              warning: '#FB8C00',
            },
          },
          dark: {
            colors: {
              primary: '#2196F3',
              secondary: '#424242',
              accent: '#FF4081',
              error: '#FF5252',
              info: '#2196F3',
              success: '#4CAF50',
              warning: '#FB8C00',
            },
          },
        },
      },
    },
  },
  apollo: {
    clients: {
      default: {
        httpEndpoint: process.env.GRAPHQL_ENDPOINT || 'http://localhost:8080/v1/graphql',
        httpLinkOptions: {
          headers: {
            'x-hasura-admin-secret': process.env.HASURA_ADMIN_SECRET || '',
          },
        },
        authType: 'Bearer',
        authHeader: 'Authorization',
        tokenStorage: 'cookie',
      },
    },
  },
  runtimeConfig: {
    public: {
      graphqlEndpoint: process.env.GRAPHQL_ENDPOINT || 'http://localhost:8080/v1/graphql',
      apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
    },
  },
  css: ['vuetify/styles'],
  ssr: true,
  typescript: {
    strict: true,
  },
});
