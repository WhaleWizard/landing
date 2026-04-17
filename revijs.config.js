export default {
  routes: async () => {
    const staticRoutes = [
      '/',
      '/services',
      '/calculator',
      '/roi-calculator',
      '/blog',
      '/privacy-policy',
      '/offer',
      '/cookie-policy',
    ];
    try {
      const res = await fetch('https://api.jsonbin.io/v3/b/69de47b136566621a8b15081/latest');
      const data = await res.json();
      const articles = data.record || [];
      const dynamicRoutes = articles.map(article => `/blog/${article.slug}`);
      return [...staticRoutes, ...dynamicRoutes];
    } catch (error) {
      console.error('Failed to fetch articles for revijs:', error);
      return staticRoutes;
    }
  },
  outputDir: 'dist-prerendered',
  waitFor: 2000,
};
