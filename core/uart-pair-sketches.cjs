'use strict';

// Source of truth for inert UART lab sketches. Names and serial routes are fixed,
// not interpolated from untrusted workspace metadata. No GPIO or control commands.
const ESP32='esp32:esp32:esp32';
const ESP8266='esp8266:esp8266:generic';
const esp32Initiator=Object.freeze({
 name:'BlazeUartEsp32Initiator',
 fqbn:ESP32,
 source:`
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
`.trimStart()
});

// Both PONG responders share the same reviewed C++ implementation. Only the
// compile-target-specific serial port and its fixed initialization differ.
function responder({name,fqbn,description,serial,begin}){
 return Object.freeze({
  name,fqbn,
  source:`#include "BlazeUartFrame.h"
// ${description}
// INERT PING/PONG ONLY. No wiring, power, relay, payment or auth approval.
using namespace BlazeUart;
static Parser receiver;
static uint32_t replied=0;
void setup(){${begin};}
void loop(){
 receiver.expire(millis());
 for(uint8_t i=0;i<32&&${serial}.available()>0;++i){
  const int incoming=${serial}.read();
  if(incoming<0)break;
  Frame request;
  if(receiver.feed(static_cast<uint8_t>(incoming),millis(),request)){
   Frame response;
   if(makePong(request,response)){
    uint8_t encoded[MAX_FRAME];
    const size_t n=encode(response,encoded,sizeof(encoded));
    if(n){${serial}.write(encoded,n);++replied;}
   }
  }
 }
}
`
 });
}
const esp8266Responder=responder({
 name:'BlazeUartEsp8266Responder',fqbn:ESP8266,
 description:'ESP8266 Generic UART0 RX GPIO3 / TX GPIO1; USB programming may share Serial.',
 serial:'Serial',begin:'Serial.begin(9600)'
});
const esp32Responder=responder({
 name:'BlazeUartEsp32Responder',fqbn:ESP32,
 description:'Classic ESP32 UART1 RX GPIO26 / TX GPIO25; carrier pin access unverified.',
 serial:'Serial1',begin:'Serial1.begin(9600,SERIAL_8N1,26,25)'
});
const SKETCHES=Object.freeze({esp32Initiator,esp8266Responder,esp32Responder});
const demos=Object.freeze([esp32Initiator,esp8266Responder]);

module.exports={ESP32,ESP8266,SKETCHES,demos,esp32Responder};
