#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <time.h>
#include <LittleFS.h>

// Ajuste estes valores para o seu circuito.
const char *ssid = "Rennhack_Oi_Fibra_2G";
const char *password = "isana022";
const char *fallbackApSsid = "Iluminacao-ESP32";
const char *fallbackApPassword = "12345678";

// Credenciais/configuracao do Firestore.
const char *firestoreProjectId = "SEU_PROJECT_ID";
const char *firestoreApiKey = "SUA_WEB_API_KEY";
const char *firestoreDatabaseId = "(default)";
const char *firestoreCollection = "readings";

// Identificacao usada pela interface externa.
const char *userId = "usuario1";
const char *roomId = "sala"; // sala | cozinha | quarto1 | quarto2 | banheiro

const int PRESENCE_SENSOR_PIN = 14; // Saida digital do sensor de presenca/PIR.
const int LAMP_MOSFET_PIN = 27;     // Gate do MOSFET que aciona o LED de alta potencia.

const bool SENSOR_ACTIVE_LEVEL = HIGH;
const bool MOSFET_ACTIVE_LEVEL = HIGH;

const float LAMP_POWER_WATTS = 10.0;      // Potencia estimada do LED/lampada.
const unsigned long SENSOR_POLL_MS = 200;
const unsigned long ABSENCE_OFF_DELAY_MS = 5000; // Evita desligar em pequenas falhas do sensor.

const char *LOG_FILE = "/lamp_logs.csv";
const char *STATS_FILE = "/lamp_stats.txt";

WebServer server(80);

bool lampOn = false;
unsigned long lampTurnedOnMs = 0;
unsigned long lastPresenceMs = 0;
unsigned long lastSensorPollMs = 0;
unsigned long lastBucketAccountingMs = 0;
unsigned long totalOnTimeMs = 0;
unsigned long activationCount = 0;
unsigned long currentHourBucket = 0;
unsigned long bucketOnTimeMs = 0;
unsigned long bucketPresenceCount = 0;

String currentTimestamp()
{
  struct tm timeinfo;
  char buffer[30];

  if (getLocalTime(&timeinfo)) {
    strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", &timeinfo);
    return String(buffer);
  }

  return String("sem horario");
}

String formatDuration(unsigned long durationMs)
{
  unsigned long seconds = durationMs / 1000;
  unsigned long hours = seconds / 3600;
  unsigned long minutes = (seconds % 3600) / 60;
  seconds = seconds % 60;

  char buffer[24];
  snprintf(buffer, sizeof(buffer), "%02lu:%02lu:%02lu", hours, minutes, seconds);
  return String(buffer);
}

float energyKwhFromMs(unsigned long durationMs)
{
  return (LAMP_POWER_WATTS * (durationMs / 3600000.0f)) / 1000.0f;
}

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

unsigned long currentSessionMs()
{
  if (!lampOn) return 0;
  return millis() - lampTurnedOnMs;
}

unsigned long accumulatedOnTimeMs()
{
  return totalOnTimeMs + currentSessionMs();
}

void saveStats()
{
  File file = LittleFS.open(STATS_FILE, FILE_WRITE);
  if (!file) {
    Serial.println("Erro ao salvar estatisticas.");
    return;
  }

  file.println(totalOnTimeMs);
  file.println(activationCount);
  file.close();
}

void loadStats()
{
  if (!LittleFS.exists(STATS_FILE)) return;

  File file = LittleFS.open(STATS_FILE, FILE_READ);
  if (!file) {
    Serial.println("Erro ao carregar estatisticas.");
    return;
  }

  totalOnTimeMs = file.readStringUntil('\n').toInt();
  activationCount = file.readStringUntil('\n').toInt();
  file.close();
}

void ensureLogFile()
{
  if (LittleFS.exists(LOG_FILE)) return;

  File file = LittleFS.open(LOG_FILE, FILE_WRITE);
  if (!file) {
    Serial.println("Erro ao criar arquivo de log.");
    return;
  }

  file.println("timestamp,event,duration_s,energy_kwh,total_on_s,activation_count");
  file.close();
}

void appendLog(const char *event, unsigned long durationMs)
{
  File file = LittleFS.open(LOG_FILE, FILE_APPEND);
  if (!file) {
    Serial.println("Erro ao abrir arquivo de log.");
    return;
  }

  file.print(currentTimestamp());
  file.print(",");
  file.print(event);
  file.print(",");
  file.print(durationMs / 1000.0f, 3);
  file.print(",");
  file.print(energyKwhFromMs(durationMs), 6);
  file.print(",");
  file.print(accumulatedOnTimeMs() / 1000.0f, 3);
  file.print(",");
  file.println(activationCount);
  file.close();
}

unsigned long currentEpoch()
{
  time_t now = time(nullptr);
  if (now < 1700000000) return 0;
  return (unsigned long)now;
}

unsigned long hourBucketFromEpoch(unsigned long epoch)
{
  return epoch - (epoch % 3600UL);
}

String firestoreTimestamp(unsigned long epoch)
{
  time_t rawTime = (time_t)epoch;
  struct tm timeinfo;
  char buffer[25];

  gmtime_r(&rawTime, &timeinfo);
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buffer);
}

String firestoreCollectionUrl()
{
  String url = "https://firestore.googleapis.com/v1/projects/";
  url += firestoreProjectId;
  url += "/databases/";
  url += firestoreDatabaseId;
  url += "/documents/";
  url += firestoreCollection;
  url += "?key=";
  url += firestoreApiKey;

  return url;
}

String buildFirestoreReadingPayload(unsigned long hourBucket, unsigned long secondsOn, unsigned long presenceCount)
{
  String payload;
  payload.reserve(420);
  payload += "{\"fields\":{";
  payload += "\"userId\":{\"stringValue\":\"";
  payload += jsonEscape(userId);
  payload += "\"},";
  payload += "\"roomId\":{\"stringValue\":\"";
  payload += jsonEscape(roomId);
  payload += "\"},";
  payload += "\"hour\":{\"timestampValue\":\"";
  payload += firestoreTimestamp(hourBucket);
  payload += "\"},";
  payload += "\"secondsOn\":{\"integerValue\":\"";
  payload += String(secondsOn);
  payload += "\"},";
  payload += "\"presenceCount\":{\"integerValue\":\"";
  payload += String(presenceCount);
  payload += "\"}";
  payload += "}}";

  return payload;
}

bool sendHourlyReadingToFirestore(unsigned long hourBucket, unsigned long secondsOn, unsigned long presenceCount)
{
  if (hourBucket == 0 || (secondsOn == 0 && presenceCount == 0)) {
    return true;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Firestore: WiFi desconectado, envio ignorado.");
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, firestoreCollectionUrl());
  http.addHeader("Content-Type", "application/json");

  String payload = buildFirestoreReadingPayload(hourBucket, secondsOn, presenceCount);
  int statusCode = http.POST(payload);

  if (statusCode < 200 || statusCode >= 300) {
    Serial.print("Firestore: erro no envio. HTTP ");
    Serial.println(statusCode);
    Serial.println(http.getString());
    http.end();
    return false;
  }

  http.end();
  Serial.println("Firestore: leitura horaria enviada.");
  return true;
}

String buildStatusPayload(bool presenceDetected)
{
  String payload;
  payload.reserve(260);
  payload += "{";
  payload += "\"timestamp\":\"";
  payload += jsonEscape(currentTimestamp());
  payload += "\",\"userId\":\"";
  payload += jsonEscape(userId);
  payload += "\",\"roomId\":\"";
  payload += jsonEscape(roomId);
  payload += "\",\"presence\":";
  payload += presenceDetected ? "true" : "false";
  payload += ",\"lamp_on\":";
  payload += lampOn ? "true" : "false";
  payload += ",\"current_hour\":\"";
  payload += firestoreTimestamp(currentHourBucket);
  payload += "\",\"secondsOn\":";
  payload += String(bucketOnTimeMs / 1000UL);
  payload += ",\"presenceCount\":";
  payload += String(bucketPresenceCount);
  payload += ",\"total_on_s\":";
  payload += String(accumulatedOnTimeMs() / 1000.0f, 3);
  payload += ",\"activation_count\":";
  payload += String(activationCount);
  payload += ",\"lamp_power_watts\":";
  payload += String(LAMP_POWER_WATTS, 1);
  payload += "}";

  return payload;
}

bool flushCurrentHourToFirestore()
{
  unsigned long secondsOn = bucketOnTimeMs / 1000UL;
  if (secondsOn > 3600UL) secondsOn = 3600UL;

  if (sendHourlyReadingToFirestore(currentHourBucket, secondsOn, bucketPresenceCount)) {
    bucketOnTimeMs = 0;
    bucketPresenceCount = 0;
    return true;
  }

  return false;
}

void updateHourlyBucket(unsigned long nowMs)
{
  unsigned long epoch = currentEpoch();
  if (epoch == 0) return;

  unsigned long hourBucket = hourBucketFromEpoch(epoch);

  if (currentHourBucket == 0) {
    currentHourBucket = hourBucket;
    lastBucketAccountingMs = nowMs;
    return;
  }

  if (lampOn && nowMs >= lastBucketAccountingMs) {
    bucketOnTimeMs += nowMs - lastBucketAccountingMs;
  }
  lastBucketAccountingMs = nowMs;

  if (hourBucket != currentHourBucket) {
    if (flushCurrentHourToFirestore()) {
      currentHourBucket = hourBucket;
      bucketOnTimeMs = 0;
      bucketPresenceCount = 0;
    }
  }
}

void initCurrentHourBucket()
{
  unsigned long epoch = currentEpoch();
  if (epoch == 0) return;

  currentHourBucket = hourBucketFromEpoch(epoch);
  lastBucketAccountingMs = millis();
}

void setLamp(bool enabled)
{
  if (enabled == lampOn) return;

  lampOn = enabled;
  digitalWrite(LAMP_MOSFET_PIN, enabled ? MOSFET_ACTIVE_LEVEL : !MOSFET_ACTIVE_LEVEL);

  if (enabled) {
    lampTurnedOnMs = millis();
    activationCount++;
    bucketPresenceCount++;
    appendLog("ON", 0);
    saveStats();
    Serial.println("Presenca detectada: lampada ligada.");
    return;
  }

  unsigned long sessionMs = millis() - lampTurnedOnMs;
  totalOnTimeMs += sessionMs;
  appendLog("OFF", sessionMs);
  saveStats();
  Serial.print("Sem presenca: lampada desligada. Sessao: ");
  Serial.println(formatDuration(sessionMs));
}

void connectWiFi()
{
  Serial.println("Conectando ao WiFi...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  for (int attempt = 0; attempt < 20 && WiFi.status() != WL_CONNECTED; attempt++) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("WiFi conectado. Acesse: http://");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nFalha ao conectar no WiFi. Criando ponto de acesso local...");
    WiFi.mode(WIFI_AP);
    WiFi.softAP(fallbackApSsid, fallbackApPassword);
    Serial.print("Acesse a rede ");
    Serial.print(fallbackApSsid);
    Serial.print(" e abra: http://");
    Serial.println(WiFi.softAPIP());
  }
}

void initTime()
{
  configTime(-3 * 3600, 0, "pool.ntp.org", "time.nist.gov");

  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 5000)) {
    Serial.println("Horario sincronizado por NTP.");
  } else {
    Serial.println("Nao foi possivel sincronizar horario agora.");
  }
}

void handleRoot()
{
  server.send(200, "application/json; charset=utf-8", buildStatusPayload(digitalRead(PRESENCE_SENSOR_PIN) == SENSOR_ACTIVE_LEVEL));
}

void handleLogs()
{
  File file = LittleFS.open(LOG_FILE, FILE_READ);
  if (!file) {
    server.send(404, "text/plain", "Log nao encontrado.");
    return;
  }

  server.streamFile(file, "text/csv");
  file.close();
}

void handleReset()
{
  totalOnTimeMs = 0;
  activationCount = 0;
  bucketOnTimeMs = 0;
  bucketPresenceCount = 0;
  if (lampOn) lampTurnedOnMs = millis();

  LittleFS.remove(LOG_FILE);
  ensureLogFile();
  saveStats();

  server.sendHeader("Location", "/");
  server.send(303);
}

void startWebServer()
{
  server.on("/", HTTP_GET, handleRoot);
  server.on("/logs.csv", HTTP_GET, handleLogs);
  server.on("/reset", HTTP_POST, handleReset);
  server.begin();
  Serial.println("Servidor web iniciado.");
}

void updateLighting()
{
  unsigned long now = millis();
  if (now - lastSensorPollMs < SENSOR_POLL_MS) return;
  lastSensorPollMs = now;

  bool presenceDetected = digitalRead(PRESENCE_SENSOR_PIN) == SENSOR_ACTIVE_LEVEL;
  updateHourlyBucket(now);

  if (presenceDetected) {
    lastPresenceMs = now;
    setLamp(true);
    return;
  }

  if (lampOn && now - lastPresenceMs >= ABSENCE_OFF_DELAY_MS) {
    setLamp(false);
  }
}

void setup()
{
  Serial.begin(115200);
  delay(1000);

  pinMode(PRESENCE_SENSOR_PIN, INPUT);
  pinMode(LAMP_MOSFET_PIN, OUTPUT);
  digitalWrite(LAMP_MOSFET_PIN, !MOSFET_ACTIVE_LEVEL);

  if (!LittleFS.begin(true)) {
    Serial.println("Erro ao montar LittleFS. Logs nao serao gravados.");
  } else {
    loadStats();
    ensureLogFile();
  }

  connectWiFi();
  initTime();
  initCurrentHourBucket();
  startWebServer();
}

void loop()
{
  updateLighting();
  server.handleClient();
}
