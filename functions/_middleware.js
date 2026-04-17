// functions/_middleware.js
export async function onRequest(context) {
    // Просто передаём запрос основному обработчику в og.js
    return context.next();
}
