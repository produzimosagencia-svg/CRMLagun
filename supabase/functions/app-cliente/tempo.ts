// Aba "Tempo" do app Lagun Administração: previsão do Apple WeatherKit (porte do tempo.ts da
// função app-interno da Tríade). A Lagun é sempre em Vitória: coordenada fixa da casa
// (Rua Manoel Gonçalves Carneiro, 65, Praia do Canto), sem geocodificação.
//
// WeatherKit REST API com JWT ES256 assinado aqui (secrets WEATHERKIT_KEY_P8, WEATHERKIT_KEY_ID,
// WEATHERKIT_TEAM_ID, WEATHERKIT_SERVICE_ID). Cache de 30 min por coordenada, em memória.

export const LAGUN = { cidade: "Vitória", uf: "ES", latitude: -20.2946, longitude: -40.2931 };

export class ErroTempo extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

// ── WeatherKit ──────────────────────────────────────────────────────────────
const WK = "https://weatherkit.apple.com/api/v1";
export const weatherkitConfigurado = () =>
  !!(Deno.env.get("WEATHERKIT_KEY_P8") && Deno.env.get("WEATHERKIT_KEY_ID") && Deno.env.get("WEATHERKIT_TEAM_ID") && Deno.env.get("WEATHERKIT_SERVICE_ID"));

const b64url = (d: string | Uint8Array) => {
  const s = typeof d === "string" ? btoa(unescape(encodeURIComponent(d))) : btoa(String.fromCharCode(...d));
  return s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
};
let jwtGuardado: { em: number; jwt: string } | null = null;

/** JWT ES256 do WeatherKit (mesmo esquema do jwtApns da bar-ao-vivo-push). Vale 1 h; renova aos 45 min. */
async function jwtWeatherKit() {
  if (jwtGuardado && Date.now() - jwtGuardado.em < 45 * 60_000) return jwtGuardado.jwt;
  const pem = Deno.env.get("WEATHERKIT_KEY_P8")!, kid = Deno.env.get("WEATHERKIT_KEY_ID")!;
  const time = Deno.env.get("WEATHERKIT_TEAM_ID")!, servico = Deno.env.get("WEATHERKIT_SERVICE_ID")!;
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const agora = Math.floor(Date.now() / 1000);
  const corpo = `${b64url(JSON.stringify({ alg: "ES256", kid, id: `${time}.${servico}` }))}.${b64url(JSON.stringify({ iss: time, iat: agora, exp: agora + 3600, sub: servico }))}`;
  const assinatura = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, new TextEncoder().encode(corpo)));
  jwtGuardado = { em: Date.now(), jwt: `${corpo}.${b64url(assinatura)}` };
  return jwtGuardado.jwt;
}

async function wk(caminho: string, q: URLSearchParams) {
  const r = await fetch(`${WK}/${caminho}?${q}`, { headers: { Authorization: `Bearer ${await jwtWeatherKit()}`, Accept: "application/json" } });
  if (r.status === 401 || r.status === 403) { jwtGuardado = null; throw new ErroTempo("A Apple recusou a chave do WeatherKit. Confira a chave e o Service ID.", 502); }
  if (!r.ok) throw new ErroTempo(`O serviço de previsão da Apple não respondeu (${r.status}).`, 502);
  return r.json();
}

// Cache de 30 min em memória da função (a Lagun não tem a tabela app_tempo_cache da Tríade).
const memoria = new Map<string, { em: number; dados: unknown }>();
async function doCache(chave: string, validade: number, buscar: () => Promise<unknown>) {
  const m = memoria.get(chave);
  if (m && Date.now() - m.em < validade) return m.dados;
  const dados = await buscar();
  memoria.set(chave, { em: Date.now(), dados });
  if (memoria.size > 200) memoria.delete(memoria.keys().next().value!);
  return dados;
}

/** Dias à frente que a previsão alcança: hoje + 9 (10 dias no total, limite da previsão diária da Apple). */
export const ALCANCE_DIAS = 9;
const diaSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Previsão da coordenada para um evento: agora, hora a hora (de agora até 06h do dia seguinte
 * ao evento, ou só as próximas 24 h quando o dia do evento ainda está fora do alcance),
 * próximos 10 dias e alertas oficiais quando a Apple tiver para o Brasil.
 */
export async function previsao(lat: number, lon: number, dataEvento: string | null) {
  const hoje = diaSP(new Date());
  const limite = somarDias(hoje, ALCANCE_DIAS);
  const noAlcance = !!dataEvento && dataEvento >= hoje && dataEvento <= limite;
  const inicio = new Date(Math.floor(Date.now() / 3600000) * 3600000);
  // 06h do dia seguinte ao evento em São Paulo = 09h UTC.
  const fimEvento = noAlcance ? new Date(`${somarDias(dataEvento!, 1)}T09:00:00Z`) : null;
  const fim = new Date(Math.min(inicio.getTime() + 240 * 3600000, Math.max(inicio.getTime() + 24 * 3600000, fimEvento?.getTime() ?? 0)));
  const coord = `${lat.toFixed(3)},${lon.toFixed(3)}`;

  const disponiveis = (await doCache(`disp:${coord}`, 24 * 3600_000, () => wk(`availability/${lat}/${lon}`, new URLSearchParams({ country: "BR" })))) as string[];
  const dataSets = ["currentWeather", "forecastHourly", "forecastDaily", ...(Array.isArray(disponiveis) && disponiveis.includes("weatherAlerts") ? ["weatherAlerts"] : [])];

  const bruto = (await doCache(`tempo:${coord}:${fim.toISOString().slice(0, 13)}`, 30 * 60_000, () => wk(`weather/pt_BR/${lat}/${lon}`, new URLSearchParams({
    dataSets: dataSets.join(","), timezone: "America/Sao_Paulo", countryCode: "BR",
    hourlyStart: inicio.toISOString(), hourlyEnd: fim.toISOString(),
  })))) as any;

  const c = bruto?.currentWeather;
  const horas = ((bruto?.forecastHourly?.hours ?? []) as any[]).map((h) => ({
    em: h.forecastStart, temp: h.temperature, condicao: h.conditionCode, chuva: h.precipitationChance ?? 0,
    mm: h.precipitationAmount ?? 0, vento: h.windSpeed ?? null, rajada: h.windGust ?? null, dia: h.daylight !== false,
  }));
  return {
    noAlcance,
    aPartirDe: dataEvento && !noAlcance && dataEvento > limite ? somarDias(dataEvento, -ALCANCE_DIAS) : null,
    agora: c ? {
      em: c.asOf, temp: c.temperature, sensacao: c.temperatureApparent, condicao: c.conditionCode, umidade: c.humidity,
      vento: c.windSpeed, rajada: c.windGust ?? null, direcao: c.windDirection ?? null, uv: c.uvIndex ?? null, dia: c.daylight !== false,
      chuva: horas[0]?.chuva ?? null,
    } : null,
    horas,
    dias: ((bruto?.forecastDaily?.days ?? []) as any[]).map((d) => ({
      dia: diaSP(new Date(d.forecastStart)), max: d.temperatureMax, min: d.temperatureMin, condicao: d.conditionCode,
      chuva: d.precipitationChance ?? 0, mm: d.precipitationAmount ?? 0, vento: d.daytimeForecast?.windSpeed ?? d.windSpeedMax ?? null,
      nascer: d.sunrise ?? null, por: d.sunset ?? null,
    })),
    alertas: ((bruto?.weatherAlerts?.alerts ?? []) as any[]).map((a) => ({
      titulo: a.description, area: a.areaName ?? null, severidade: a.severity ?? null, fonte: a.source ?? null, link: a.detailsUrl ?? null, ate: a.expireTime ?? null,
    })),
    atualizadoEm: c?.metadata?.readTime ?? bruto?.forecastHourly?.metadata?.readTime ?? new Date().toISOString(),
  };
}
