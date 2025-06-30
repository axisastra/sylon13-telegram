import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch";
import fs from "fs";
import http from "http";
import dotenv from "dotenv";
import { config, configUtils } from "./config.js";

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

console.log(config.messages.status.checkingEnvVars);
console.log("TELEGRAM_BOT_TOKEN:", TELEGRAM_BOT_TOKEN ? "✅ Presente" : "❌ Ausente");
console.log("OPENROUTER_API_KEY:", OPENROUTER_API_KEY ? "✅ Presente" : "❌ Ausente");

if (!configUtils.validateEnvironment()) {
  console.error("❌ Variáveis de ambiente ausentes - Configure no painel Secrets");
  process.exit(1);
}

console.log(config.messages.status.envVarsLoaded);

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on('polling_error', (error) => {
  console.error('❌ Erro de polling:', error.message);
});

console.log(config.messages.status.botOnline);

// === Servidor de Ping para manter ativo ===
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`${config.server.healthCheckMessage}${new Date().toISOString()}`);
});

server.listen(config.server.port, config.server.host, () => {
  console.log(`${config.messages.status.serverRunning} ${config.server.port}`);
  console.log(`${config.messages.status.pingUrl} ${configUtils.getReplUrl()}`);
});

if (config.server.enableAutoPing) {
  setInterval(async () => {
    try {
      const response = await fetch(`http://localhost:${config.server.port}`);
      console.log(`${config.messages.status.autoPingSuccess} ${response.status} - ${new Date().toISOString()}`);
    } catch (error) {
      console.log(`${config.messages.status.autoPingFailed} ${error.message}`);
    }
  }, config.server.pingInterval);
}

// === Registro de histórico ===
function registrarLog(user, pergunta, resposta) {
  if (!config.logging.enabled) return;

  const logFile = config.logging.fileName;
  let historico = [];

  if (fs.existsSync(logFile)) {
    const conteudo = fs.readFileSync(logFile);
    historico = JSON.parse(conteudo);
  }

  if (historico.length >= config.logging.maxLogEntries) {
    historico = historico.slice(-config.logging.maxLogEntries + 1);
  }

  const logEntry = { pergunta, resposta };

  if (config.logging.includeTimestamp) {
    logEntry.timestamp = new Date().toISOString();
  }

  if (config.logging.includeUserInfo) {
    logEntry.user = user;
  }

  historico.push(logEntry);
  fs.writeFileSync(logFile, JSON.stringify(historico, null, 2));
}

// === Comando /padrões ===
bot.onText(/\/padrões/, async (msg) => {
  const chatId = msg.chat.id;

  if (!fs.existsSync("log.json")) {
    await bot.sendMessage(chatId, "Nenhum histórico disponível ainda.");
    return;
  }

  const logs = JSON.parse(fs.readFileSync("log.json"));
  const perguntas = logs.map(l => l.pergunta).join("\n");

  const prompt = `
Analise o conteúdo abaixo e identifique:

1. Os principais temas recorrentes
2. Emoções mais frequentes
3. Comportamentos repetitivos
4. Palavras-chave mais citadas
5. Qualquer padrão psicológico, espiritual ou prático presente

Seja analítico. Evite linguagem simbólica excessiva. Seja claro e direto.

Conteúdo:

${perguntas}
  `;

  const payload = {
    model: "meta-llama/llama-3-70b-instruct",
    temperature: 0.6,
    messages: [
      { role: "system", content: "Você é um analista de padrões de comportamento digital." },
      { role: "user", content: prompt }
    ],
    max_tokens: 2000,
  };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Não consegui identificar padrões.";
    await bot.sendMessage(chatId, reply);
  } catch (err) {
    console.error("❌ Erro na análise de padrões:", err.message);
    await bot.sendMessage(chatId, "Erro ao tentar identificar padrões.");
  }
});

// === Comando /resumo ===
bot.onText(/\/resumo/, async (msg) => {
  const chatId = msg.chat.id;

  if (!fs.existsSync("log.json")) {
    await bot.sendMessage(chatId, "Nenhum histórico encontrado.");
    return;
  }

  const logs = JSON.parse(fs.readFileSync("log.json"));
  const perguntas = logs.map(l => l.pergunta).join("\n");

  const prompt = `
Abaixo está um histórico de interações. Gere um RESUMO conciso, organizado por tópicos ou temas. Evite repetições e destaque os principais assuntos abordados.

Conteúdo:

${perguntas}
  `;

  const payload = {
    model: "meta-llama/llama-3-70b-instruct",
    temperature: 0.5,
    messages: [
      { role: "system", content: "Você é um oráculo analítico digital, especialista em gerar resumos úteis e claros." },
      { role: "user", content: prompt }
    ],
    max_tokens: 2000
  };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Não consegui gerar um resumo.";
    await bot.sendMessage(chatId, reply);
  } catch (err) {
    console.error("❌ Erro no /resumo:", err.message);
    await bot.sendMessage(chatId, "Erro ao gerar resumo.");
  }
});

// === Comando /insight ===
bot.onText(/\/insight/, async (msg) => {
  const chatId = msg.chat.id;

  if (!fs.existsSync("log.json")) {
    await bot.sendMessage(chatId, "Nenhum histórico disponível.");
    return;
  }

  const logs = JSON.parse(fs.readFileSync("log.json"));
  const perguntas = logs.map(l => l.pergunta).join("\n");

  const prompt = `
Com base nas interações abaixo, gere insights estratégicos e profundos. Foque em padrões mentais, comportamentos recorrentes, sinais de evolução ou estagnação. Seja claro, preciso e útil.

Conteúdo:

${perguntas}
  `;

  const payload = {
    model: "meta-llama/llama-3-70b-instruct",
    temperature: 0.55,
    messages: [
      { role: "system", content: "Você é um analista avançado, parte hacker de dados, parte oráculo do comportamento humano." },
      { role: "user", content: prompt }
    ],
    max_tokens: 2000
  };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Insight não disponível no momento.";
    await bot.sendMessage(chatId, reply);
  } catch (err) {
    console.error("❌ Erro no /insight:", err.message);
    await bot.sendMessage(chatId, "Erro ao gerar insight.");
  }
});

// === Conversa normal ===
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/padrões") || text.startsWith("/resumo") || text.startsWith("/insight")) return;

  const systemPrompt = config.ai.systemPrompt;

  const payload = {
    model: "meta-llama/llama-3-70b-instruct",
    temperature: 0.45,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text }
    ],
    max_tokens: 2000
  };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Resposta vazia da IA.";

    if (reply === "Resposta vazia da IA.") {
      await bot.sendMessage(chatId, "⚠️ A IA retornou uma resposta vazia. Tente reformular sua pergunta.");
      return;
    }

    await bot.sendMessage(chatId, reply);
    registrarLog(msg.from?.username || chatId, text, reply);
  } catch (error) {
    console.error("❌ Erro ao processar mensagem:", error.message);
    await bot.sendMessage(chatId, "⚠️ Erro ao gerar resposta. Tente novamente em alguns instantes.");
  }
});
