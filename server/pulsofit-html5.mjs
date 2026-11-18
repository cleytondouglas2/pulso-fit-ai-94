/**
 * Upgrade não destrutivo do HTML entregue pelo PulsoFit.
 * Preserva scripts, formulários, sessões, endpoints, CSS, banco e rotas.
 * Adiciona apenas metadados do padrão HTML5 quando estão ausentes.
 */
export function ensureHTML5Document(source) {
  if (typeof source !== "string") throw new TypeError("Expected HTML source");
  if (!/<html\b[^>]*>/i.test(source) || !/<head\b[^>]*>/i.test(source)) {
    return { html: source, valid: false, changed: false, additions: [] };
  }
  const additions = [];
  let html = source;
  if (!/<!doctype\s+html\b[^>]*>/i.test(html)) {
    if (/<!doctype\b[^>]*>/i.test(html)) {
      html = html.replace(/<!doctype\b[^>]*>/i, "<!DOCTYPE html>");
    } else {
      html = html.replace(/<html\b/i, "<!DOCTYPE html>\n<html");
    }
    additions.push("doctype");
  }
  html = html.replace(/<html\b([^>]*)>/i, (match, attributes) => {
    if (/\blang\s*=/i.test(attributes)) return match;
    additions.push("lang");
    return '<html lang="pt-BR"' + attributes + '>';
  });
  const meta = [];
  if (!/<meta\b[^>]*\bcharset\s*=/i.test(html)) {
    meta.push('<meta charset="utf-8">');
    additions.push("charset");
  }
  if (!/<meta\b[^>]*\bname\s*=\s*(?:"viewport"|'viewport'|viewport)(?=[\s/>])/i.test(html)) {
    meta.push('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
    additions.push("viewport");
  }
  if (!/<meta\b[^>]*\bname\s*=\s*(?:"description"|'description'|description)(?=[\s/>])/i.test(html)) {
    meta.push('<meta name="description" content="PulsoFit AI: treinos personalizados, Coach IA, metas, Performance e acompanhamento da evolução.">');
    additions.push("description");
  }
  if (!/<meta\b[^>]*\bname\s*=\s*(?:"theme-color"|'theme-color'|theme-color)(?=[\s/>])/i.test(html)) {
    meta.push('<meta name="theme-color" content="#0b1024">');
    additions.push("theme-color");
  }
  if (!/<meta\b[^>]*\bname\s*=\s*(?:"pulsofit-html5"|'pulsofit-html5'|pulsofit-html5)(?=[\s/>])/i.test(html)) {
    meta.push('<meta name="pulsofit-html5" content="2026-11">');
    additions.push("version");
  }
  if (meta.length) {
    html = html.replace(/<head\b[^>]*>/i, (openTag) => openTag + '\n  ' + meta.join('\n  '));
  }
  return { html, valid: true, changed: html !== source, additions };
}
