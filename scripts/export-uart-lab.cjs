#!/usr/bin/env node
'use strict';
// Export bounded, inert UART ping/pong lab sketches. NEVER flash or auto-wire.
// Source pin values reflect only the exact curated example FQBNs.
const fs=require('node:fs'),path=require('node:path');
const root=process.argv[2];
if(!root||!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw Error('Provide an existing output parent directory');
const header=fs.readFileSync(path.join(__dirname,'../core/firmware/BlazeUartFrame.h'),'utf8');

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
for(const [name,fqbn,ino] of demos){
 const dir=path.join(root,name);
 if(fs.existsSync(dir))throw Error('Refusing to overwrite existing UART lab demo: '+dir);
 fs.mkdirSync(dir);
 fs.writeFileSync(path.join(dir,name+'.ino'),ino.trimStart(),'utf8');
 fs.writeFileSync(path.join(dir,'BlazeUartFrame.h'),header,'utf8');
 console.log(JSON.stringify({name,fqbn,sketch:path.join(dir,name+'.ino'),header:'BlazeUartFrame.h',kind:'inert-ping-pong',wireApproval:false}));
}
