// Deterministic two-peer in-memory UART frame transport. NO real serial port,
 // GPIO writes, hardware devices, wiring, or external financial actions.
#include "../../core/firmware/BlazeUartFrame.h"
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
using namespace BlazeUart;
static bool deliver(Parser &receiver,const uint8_t *bytes,size_t n,uint32_t time,Frame &result){
 bool got=false;
 for(size_t i=0;i<n;++i){
  const bool now=receiver.feed(bytes[i],time+static_cast<uint32_t>(i),result);
  got=got||now;
 }
 return got;
}
int main(){
 Parser initiator, responder;
 uint8_t a[MAX_FRAME],b[MAX_FRAME];
 for(unsigned seq=0;seq<256;++seq){
  Frame request,parsed,reply,received;
  request.kind=PING;request.sequence=static_cast<uint8_t>(seq);request.length=3;
  request.payload[0]=0x42;request.payload[1]=0xA5;request.payload[2]=static_cast<uint8_t>(seq);
  const size_t n=encode(request,a,sizeof(a));
  assert(n==9);
  const uint32_t ts=static_cast<uint32_t>(seq*60);
  assert(deliver(responder,a,n,ts,parsed));
  assert(parsed.kind==PING&&parsed.sequence==request.sequence);
  assert(makePong(parsed,reply));
  const size_t m=encode(reply,b,sizeof(b));
  assert(m==n);
  assert(deliver(initiator,b,m,ts+20,received));
  assert(received.kind==PONG&&received.sequence==request.sequence&&received.length==3);
  assert(memcmp(received.payload,request.payload,3)==0);
  assert(!makePong(received,reply)); // no responder loop or unexpected command
 }
 // A corrupted request is not actionable: no parsed frame => no PONG.
 Frame request,parsed,reply;
 request.kind=PING;request.sequence=5;request.length=1;request.payload[0]=0x42;
 size_t n=encode(request,a,sizeof(a));
 a[n-1]^=0x80;
 assert(!deliver(responder,a,n,30000,parsed));
 assert(!makePong(Frame(),reply));
 // A fragmented request times out and is discarded; fresh valid input succeeds.
 n=encode(request,a,sizeof(a));
 responder.reset();
 assert(!deliver(responder,a,3,31000,parsed));
 responder.expire(31300);
 assert(!deliver(responder,a+3,n-3,31301,parsed));
 assert(deliver(responder,a,n,31400,parsed));
 // Noise cannot persistently poison an otherwise clean channel.
 const uint8_t garbage[]={0x00,0xFF,0xA5,0xFF,0x10};
 assert(!deliver(initiator,garbage,sizeof(garbage),32000,parsed));
 assert(deliver(initiator,a,n,32100,parsed));
 // Serial peer cannot execute arbitrary operation types.
 request.kind=0x80;
 assert(encode(request,a,sizeof(a))==0);
 printf("UART two-peer in-memory ping/pong CRC/replay-window-neutral/timeout test: PASS\n");
 return 0;
}
