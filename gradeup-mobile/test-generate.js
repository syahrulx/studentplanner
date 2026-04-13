async function run() {
  const url = 'https://ujxrtuogdialsrzxkcey.supabase.co/functions/v1/ai_generate';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'flashcards_pdf', content: 'hello' })
  });
  console.log(res.status);
  console.log(await res.text());
}
run();
