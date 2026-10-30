'use strict';
// One audited source of the two bounded, inert UART lab firmwares.
// Exact ESP32 UART1 pins RX16/TX17; ESP8266 UART0 GPIO3/GPIO1.
const demos=[
 ['BlazeUartEsp32Initiator','esp32:esp32:esp32',`
#include "BlazeUartFrame.h"
// ESP32 Dev Module LAB ONLY: Serial1 UART1, RX GPIO16 / TX GPIO17.
// No power/level-shifter/harness approval; firmware sends only inert PING.
using namespace BlazeUart;
static Parser receiver;
static uint32_t lastSent=0;
static uint8_t nextSequence=0;
static uint32_t pongCount=0;
static uint8_t pending=0;
static bool pendingValid=false;
void setup(){
 Serial1.begin(9600,SERIAL_8N1,16,17);
 lastSent=millis()-1000UL;
}
void loop(){
 const uint32_t now=millis();
 receiver.expire(now);
 for(uint8_t i=0;i<32&&Serial1.available()>0;++i){
  int c=Serial1.read();
  if(c<0)break;
  Frame packet;
  if(receiver.feed(static_cast<uint8_t>(c),millis(),packet)){
   if(packet.kind==PONG&&pendingValid&&packet.sequence==pending
    &&packet.length==1&&packet.payload[0]==0x42){
    ++pongCount;
    pendingValid=false;
   }
  }
 }
 if(static_cast<uint32_t>(now-lastSent)>=1000UL){
  Frame ping;
  ping.kind=PING;ping.sequence=nextSequence++;ping.length=1;ping.payload[0]=0x42;
  uint8_t encoded[MAX_FRAME];
  const size_t n=encode(ping,encoded,sizeof(encoded));
  if(n){Serial1.write(encoded,n);pending=ping.sequence;pendingValid=true;}
  lastSent=now;
 }
}
`],
 ['BlazeUartEsp8266Responder','esp8266:esp8266:generic',`
#include "BlazeUartFrame.h"
// ESP8266 Generic LAB ONLY: hardware UART0 Serial RX GPIO3 / TX GPIO1.
// Programming/USB serial may share these pins. Do not use Serial debug prints.
// This is not a GPIO/relay/financial or authenticated command receiver.
using namespace BlazeUart;
static Parser receiver;
static uint32_t replied=0;
void setup(){Serial.begin(9600);}
void loop(){
 receiver.expire(millis());
 for(uint8_t i=0;i<32&&Serial.available()>0;++i){
  int c=Serial.read();
  if(c<0)break;
  Frame request;
  if(receiver.feed(static_cast<uint8_t>(c),millis(),request)){
   Frame response;
   if(makePong(request,response)){
    uint8_t encoded[MAX_FRAME];
    const size_t n=encode(response,encoded,sizeof(encoded));
    if(n){Serial.write(encoded,n);++replied;}
   }
  }
 }
}
`]
];
// A second, independent ESP32 UART1 responder. TX25/RX26 are curated classic
// DevKitC GPIOs and are NOT a claim of safe carrier wiring or any WROVER layout.
const esp32Responder=Object.freeze({
 name:'BlazeUartEsp32Responder',fqbn:'esp32:esp32:esp32',
 source:`#include "BlazeUartFrame.h"
// Classic ESP32 LAB ONLY: Serial1 UART1, RX GPIO26 / TX GPIO25.
// No wire harness, power, signal integrity or bus authorization is implied.
using namespace BlazeUart;
static Parser receiver;
static uint32_t replyCount=0;
void setup(){Serial1.begin(9600,SERIAL_8N1,26,25);}
void loop(){
 receiver.expire(millis());
 for(uint8_t i=0;i<32&&Serial1.available()>0;++i){
  const int incoming=Serial1.read();
  if(incoming<0)break;
  Frame request;
  if(receiver.feed(static_cast<uint8_t>(incoming),millis(),request)){
   Frame answer;
   if(makePong(request,answer)){
    uint8_t bytes[MAX_FRAME];
    const size_t n=encode(answer,bytes,sizeof(bytes));
    if(n){Serial1.write(bytes,n);++replyCount;}
   }
  }
 }
}
`
});
module.exports={
 demos:Object.freeze(demos.map(([name,fqbn,ino])=>Object.freeze({name,fqbn,source:ino.trimStart()}))),
 esp32Responder
};
