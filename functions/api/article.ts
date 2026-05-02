export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  url.pathname = '/api/articles';
  return Response.redirect(url.toString(), 308);
};
