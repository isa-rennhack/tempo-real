#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

#include "secrets.h"

// Teste focado em banco de dados:
// 1. conecta no Wi-Fi
// 2. sincroniza horario por NTP
// 3. envia leituras mockadas para o Realtime Database

const char *userId = "usuario1";
const char *roomId = "sala";

const unsigned long SEND_INTERVAL_MS = 30000;

unsigned long lastSendMs = 0;

String jsonEscape(const String &value)
{
  String escaped;
  escaped.reserve(value.length() + 8);

  for (size_t i = 0; i < value.length(); i++) {
    char c = value[i];
    if (c == '"' || c == '\\') {
      escaped += '\\';
      escaped += c;
    } else if (c == '\n') {
      escaped += "\\n";
    } else if (c == '\r') {
      escaped += "\\r";
    } else if (c == '\t') {
      escaped += "\\t";
    } else {
      escaped += c;
    }
  }

  return escaped;
}

unsigned long currentEpoch()
{
  time_t now = time(nullptr);
  if (now < 1700000000) return 0;
  return (unsigned long)now;
}

String isoTimestamp(unsigned long epoch)
{
  time_t rawTime = (time_t)epoch;
  struct tm timeinfo;
  char buffer[25];

  gmtime_r(&rawTime, &timeinfo);
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buffer);
}

String databaseUrl()
{
  String url = firebaseDatabaseUrl;
  if (url.endsWith("/")) {
    url.remove(url.length() - 1);
  }

  url += "/readings.json?auth=";
  url += firebaseDatabaseSecret;
  return url;
}

String buildMockReadingPayload()
{
  unsigned long epoch = currentEpoch();
  unsigned long secondsOn = random(30, 900);
  unsigned long presenceCount = random(1, 12);
  float energyKwh = random(1, 80) / 1000.0f;
  float estimatedCostBrl = energyKwh * 0.92f;

  String payload;
  payload.reserve(420);
  payload += "{";
  payload += "\"userId\":\"";
  payload += jsonEscape(userId);
  payload += "\",";
  payload += "\"roomId\":\"";
  payload += jsonEscape(roomId);
  payload += "\",";
  payload += "\"createdAt\":\"";
  payload += isoTimestamp(epoch);
  payload += "\",";
  payload += "\"epoch\":";
  payload += String(epoch);
  payload += ",";
  payload += "\"secondsOn\":";
  payload += String(secondsOn);
  payload += ",";
  payload += "\"presenceCount\":";
  payload += String(presenceCount);
  payload += ",";
  payload += "\"energyKwh\":";
  payload += String(energyKwh, 4);
  payload += ",";
  payload += "\"estimatedCostBrl\":";
  payload += String(estimatedCostBrl, 4);
  payload += ",";
  payload += "\"mock\":true";
  payload += "}";

  return payload;
}

bool connectWiFi()
{
  Serial.print("Conectando ao Wi-Fi: ");
  Serial.println(wifiSsid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid, wifiPassword);

  for (int attempt = 0; attempt < 30 && WiFi.status() != WL_CONNECTED; attempt++) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Falha ao conectar no Wi-Fi.");
    return false;
  }

  Serial.print("Wi-Fi conectado. IP: ");
  Serial.println(WiFi.localIP());
  return true;
}

bool syncTime()
{
  Serial.println("Sincronizando horario por NTP...");
  configTime(-3 * 3600, 0, "pool.ntp.org", "time.nist.gov");

  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10000)) {
    Serial.println("Falha ao sincronizar horario.");
    return false;
  }

  Serial.print("Horario sincronizado: ");
  Serial.println(isoTimestamp(currentEpoch()));
  return true;
}

bool sendMockReading()
{
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi desconectado. Tentando reconectar...");
    if (!connectWiFi()) return false;
  }

  if (currentEpoch() == 0) {
    Serial.println("Horario invalido. Tentando sincronizar novamente...");
    if (!syncTime()) return false;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, databaseUrl());
  http.addHeader("Content-Type", "application/json");

  String payload = buildMockReadingPayload();
  Serial.println("Enviando leitura mockada:");
  Serial.println(payload);

  int statusCode = http.POST(payload);
  String response = http.getString();
  http.end();

  Serial.print("Realtime Database HTTP ");
  Serial.println(statusCode);
  Serial.println(response);

  if (statusCode < 200 || statusCode >= 300) {
    Serial.println("Erro ao enviar leitura.");
    return false;
  }

  Serial.println("Leitura enviada com sucesso.");
  return true;
}

void setup()
{
  Serial.begin(115200);
  delay(1000);

  randomSeed((uint32_t)esp_random());

  if (!connectWiFi()) return;
  if (!syncTime()) return;

  sendMockReading();
  lastSendMs = millis();
}

void loop()
{
  if (millis() - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = millis();
    sendMockReading();
  }
}
