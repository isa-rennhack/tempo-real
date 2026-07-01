#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

#include "secrets.h"

/*
  Teste focado em banco de dados:
  1. conecta no Wi-Fi;
  2. sincroniza horario por NTP;
  3. usa uma task para ler dados mockados;
  4. usa outra task para enviar os dados ao Firestore.
*/

// Identificadores fixos usados nos documentos enviados para o Firestore.
const char *userId = "usuario1";
const char *roomId = "sala";

// Intervalo entre leituras automaticas.
const unsigned long SEND_INTERVAL_MS = 30000;

const uint8_t READING_QUEUE_SIZE = 5;

struct ReadingData {
  unsigned long epoch;
  unsigned long secondsOn;
  unsigned long presenceCount;
  float energyKwh;
  float estimatedCostBrl;
};

QueueHandle_t readingQueue = nullptr;

/*
  Escapa caracteres especiais antes de inserir texto dentro de JSON.
  Isso evita quebrar o payload se uma string tiver aspas, barra invertida
  ou quebras de linha.
*/
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

/*
  Retorna o horario atual em Unix epoch.
  Se o ESP32 ainda nao sincronizou o relogio, retorna 0 para indicar
  horario invalido.
*/
unsigned long currentEpoch()
{
  time_t now = time(nullptr);
  if (now < 1700000000) return 0;
  return (unsigned long)now;
}

// Converte epoch para o formato de timestamp aceito pelo Firestore.
String isoTimestamp(unsigned long epoch)
{
  time_t rawTime = (time_t)epoch;
  struct tm timeinfo;
  char buffer[25];

  gmtime_r(&rawTime, &timeinfo);
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buffer);
}

// Monta a URL REST da colecao do Firestore usando os dados de secrets.h.
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

/*
  Cria uma leitura simulada. Hoje os valores sao mockados, mas este bloco
  pode ser trocado depois pela leitura real de sensores.
*/
ReadingData readMockData()
{
  ReadingData reading;
  reading.epoch = currentEpoch();
  reading.secondsOn = random(30, 900);
  reading.presenceCount = random(1, 12);
  reading.energyKwh = random(1, 80) / 1000.0f;
  reading.estimatedCostBrl = reading.energyKwh * 0.92f;

  return reading;
}

/*
  Monta o JSON no formato esperado pela API REST do Firestore.
  Cada campo precisa informar seu tipo, como stringValue, integerValue,
  doubleValue ou booleanValue.
*/
String buildReadingPayload(const ReadingData &reading)
{
  String payload;
  payload.reserve(620);
  payload += "{\"fields\":{";
  payload += "\"userId\":{\"stringValue\":\"";
  payload += jsonEscape(userId);
  payload += "\"},";
  payload += "\"roomId\":{\"stringValue\":\"";
  payload += jsonEscape(roomId);
  payload += "\"},";
  payload += "\"createdAt\":{\"timestampValue\":\"";
  payload += isoTimestamp(reading.epoch);
  payload += "\"},";
  payload += "\"epoch\":{\"integerValue\":\"";
  payload += String(reading.epoch);
  payload += "\"},";
  payload += "\"secondsOn\":{\"integerValue\":\"";
  payload += String(reading.secondsOn);
  payload += "\"},";
  payload += "\"presenceCount\":{\"integerValue\":\"";
  payload += String(reading.presenceCount);
  payload += "\"},";
  payload += "\"energyKwh\":{\"doubleValue\":";
  payload += String(reading.energyKwh, 4);
  payload += "},";
  payload += "\"estimatedCostBrl\":{\"doubleValue\":";
  payload += String(reading.estimatedCostBrl, 4);
  payload += "},";
  payload += "\"mock\":{\"booleanValue\":true}";
  payload += "}}";

  return payload;
}

/*
  Conecta o ESP32 ao Wi-Fi configurado em secrets.h.
  Retorna true quando a conexao foi feita e false quando estourou o limite
  de tentativas.
*/
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

/*
  Sincroniza o relogio interno via NTP.
  O Firestore recebe timestamps em UTC, entao o codigo usa isoTimestamp()
  para imprimir e enviar os valores no formato correto.
*/
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

/*
  Garante Wi-Fi e horario validos, monta o payload e envia para o
  Firestore por HTTPS usando HTTPClient.
*/
bool sendReading(ReadingData reading)
{
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi desconectado. Tentando reconectar...");
    if (!connectWiFi()) return false;
  }

  if (currentEpoch() == 0) {
    Serial.println("Horario invalido. Tentando sincronizar novamente...");
    if (!syncTime()) return false;
  }

  if (reading.epoch == 0) {
    reading.epoch = currentEpoch();
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, firestoreCollectionUrl());
  http.addHeader("Content-Type", "application/json");

  String payload = buildReadingPayload(reading);
  Serial.println("Enviando leitura:");
  Serial.println(payload);

  int statusCode = http.POST(payload);
  String response = http.getString();
  http.end();

  Serial.print("Firestore HTTP ");
  Serial.println(statusCode);
  Serial.println(response);

  if (statusCode < 200 || statusCode >= 300) {
    Serial.println("Erro ao enviar leitura.");
    return false;
  }

  Serial.println("Leitura enviada com sucesso.");
  return true;
}

/*
  Task responsavel apenas pela leitura dos dados.
  Ela coloca cada leitura em uma fila para a task de envio processar depois.
*/
void readingTask(void *parameter)
{
  (void)parameter;

  while (true) {
    ReadingData reading = readMockData();

    if (xQueueSend(readingQueue, &reading, 0) != pdTRUE) {
      ReadingData discarded;
      xQueueReceive(readingQueue, &discarded, 0);
      xQueueSend(readingQueue, &reading, 0);
      Serial.println("Fila cheia. Leitura antiga descartada.");
    }

    Serial.println("Leitura adicionada na fila.");
    vTaskDelay(pdMS_TO_TICKS(SEND_INTERVAL_MS));
  }
}

/*
  Task responsavel apenas pelo envio ao Firestore.
  Ela fica bloqueada aguardando uma leitura chegar na fila.
*/
void sendingTask(void *parameter)
{
  (void)parameter;

  while (true) {
    ReadingData reading;

    if (xQueueReceive(readingQueue, &reading, portMAX_DELAY) == pdTRUE) {
      sendReading(reading);
    }
  }
}

// Executa uma vez ao ligar ou resetar o ESP32.
void setup()
{
  Serial.begin(115200);
  delay(1000);

  randomSeed((uint32_t)esp_random());

  if (connectWiFi()) {
    syncTime();
  }

  readingQueue = xQueueCreate(READING_QUEUE_SIZE, sizeof(ReadingData));
  if (readingQueue == nullptr) {
    Serial.println("Falha ao criar fila de leituras.");
    return;
  }

  xTaskCreatePinnedToCore(readingTask, "ReadingTask", 4096, nullptr, 1, nullptr, 1);
  xTaskCreatePinnedToCore(sendingTask, "SendingTask", 8192, nullptr, 1, nullptr, 0);
}

// O trabalho principal fica nas tasks FreeRTOS.
void loop()
{
  vTaskDelay(pdMS_TO_TICKS(1000));
}
