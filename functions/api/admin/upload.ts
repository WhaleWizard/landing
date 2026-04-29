import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import type { Env } from '../../_lib/types';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Проверяем пароль (можно передать в formData или query)
  const url = new URL(request.url);
  const password = url.searchParams.get('password') || '';
  if (!verifyAdminPassword(password, env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return json({ success: false, error: 'No file uploaded' }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
    }

    // Генерируем уникальное имя
    const key = `uploads/${Date.now()}-${crypto.randomUUID()}-${file.name}`;
    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    // Публичный URL (зависит от способа доступа)
    // Если включён Public Access, URL будет выглядеть так:
    const publicUrl = `https://pub-${env.R2_PUBLIC_HOST || 'your-bucket-hash'}.r2.dev/${key}`;
    // Вы должны узнать точный хост из настроек бакета и заменить env.R2_PUBLIC_HOST
    // Для простоты можно захардкодить, но лучше хранить в переменной R2_PUBLIC_HOST
    // Пока вернём относительный URL, а фронт сам подставит домен
    return json({ success: true, url: publicUrl, key }, { headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
};
