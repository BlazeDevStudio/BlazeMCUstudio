#include "../../core/firmware/BlazeUartFrame.h"
#include <assert.h>
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdio.h>
using namespace BlazeUart;

static Frame packet(uint8_t kind,uint8_t seq,const uint8_t *payload,uint8_t n){
 Frame f;f.kind=kind;f.sequence=seq;f.length=n;
 for(uint8_t i=0;i<n;++i)f.payload[i]=payload[i];
 return f;
}
static bool ingest(Parser &p,const uint8_t *raw,size_t n,uint32_t start,Frame &result){
 bool ready=false;
 for(size_t i=0;i<n;++i)ready=p.feed(raw[i],start+static_cast<uint32_t>(i),result)||ready;
 return ready;
}
int main(){
 const uint8_t payload[]={0x00,0xA5,0xFF};
 Frame f=packet(PING,0x21,payload,3),decoded;
 uint8_t buf[MAX_FRAME],second[MAX_FRAME];
 const size_t length=encode(f,buf,sizeof(buf));
 assert(length==9);
 const uint8_t expected[]={0xA5,0x01,0x01,0x21,0x03,0x00,0xA5,0xFF,0x60};
 assert(memcmp(buf,expected,sizeof(expected))==0); // fixed independently derived CRC-8 vector
 Parser p;
 assert(ingest(p,buf,length,0,decoded));
 assert(decoded.kind==PING&&decoded.sequence==f.sequence&&decoded.length==3);
 assert(memcmp(decoded.payload,payload,3)==0);
 Frame pong;
 assert(makePong(decoded,pong)&&pong.kind==PONG&&pong.sequence==decoded.sequence);
 assert(memcmp(pong.payload,payload,3)==0);
 assert(!makePong(pong,f));
 const size_t len2=encode(pong,second,sizeof(second));
 assert(len2==length);
 assert(ingest(p,second,len2,20,decoded)&&decoded.kind==PONG);
 // Packet boundaries may split across arbitrary read callbacks.
 p.reset();
 for(size_t i=0;i<length-1;++i)assert(!p.feed(buf[i],static_cast<uint32_t>(i),decoded));
 assert(p.feed(buf[length-1],static_cast<uint32_t>(length-1),decoded));
 // CRC change, wrong version, illegal command type and oversized body all fail.
 uint8_t modified[MAX_FRAME];
 memcpy(modified,buf,length);modified[length-1]^=0x01;
 assert(!ingest(p,modified,length,40,decoded));
 memcpy(modified,buf,length);modified[1]=2;
 assert(!ingest(p,modified,length,60,decoded));
 memcpy(modified,buf,length);modified[2]=0x90;
 assert(!ingest(p,modified,length,80,decoded));
 memcpy(modified,buf,length);modified[4]=MAX_PAYLOAD+1;
 assert(!ingest(p,modified,length,100,decoded));
 assert(ingest(p,buf,length,120,decoded)); // resync following malformed input
 // Two bytes insufficient capacity cannot cause an out-of-bounds write.
 uint8_t guard[]={0xDD,0xDD,0xDD};
 assert(encode(f,guard,2)==0&&guard[0]==0xDD&&guard[2]==0xDD);
 Frame illegal=packet(0x80,0,payload,3);
 assert(encode(illegal,buf,sizeof(buf))==0);
 illegal=f;illegal.length=MAX_PAYLOAD+1;
 assert(encode(illegal,buf,sizeof(buf))==0);
 assert(encode(f,NULL,sizeof(buf))==0);
 // zero-length payload is an accepted ping with CRC, no special sentinel.
 Frame empty=packet(PING,8,payload,0);
 size_t shortLen=encode(empty,buf,sizeof(buf));assert(shortLen==6);
 assert(ingest(p,buf,shortLen,200,decoded)&&decoded.length==0);
 // Incomplete frame resets once the gap exceeds 250ms; a new complete packet is accepted.
 p.reset();assert(!p.feed(START,0,decoded));
 assert(!p.feed(VERSION,1,decoded));p.expire(252);
 assert(ingest(p,buf,shortLen,260,decoded));
 // millis() unsigned wrap must NOT reset healthy frames.
 p.reset();const uint32_t wrap=UINT32_MAX-2;
 for(size_t i=0;i<shortLen;++i){
  const bool done=p.feed(buf[i],wrap+static_cast<uint32_t>(i),decoded);
  if(i<shortLen-1)assert(!done);else assert(done);
 }
 // max-length payload including 0xA5 and zero is legal.
 const uint8_t full[MAX_PAYLOAD]={0,1,2,3,4,5,6,7,0xA5,9,10,11,12,13,14,255};
 Frame maxFrame=packet(PING,0xFE,full,MAX_PAYLOAD);
 size_t maxLen=encode(maxFrame,buf,sizeof(buf));assert(maxLen==MAX_FRAME);
 assert(ingest(p,buf,maxLen,300,decoded));
 assert(decoded.length==MAX_PAYLOAD&&!memcmp(decoded.payload,full,MAX_PAYLOAD));
 // Recover from repeat invalid frames without exceeding fixed memory bounds.
 uint32_t seed=0xA1C0DE1u;
 for(unsigned n=0;n<30000;++n){
  seed=seed*1664525u+1013904223u;
  const uint8_t byte=static_cast<uint8_t>(seed>>24);
  p.feed(byte,n+400,decoded);
  if((n%101)==0)p.expire(n+1000);
 }
 p.reset();
 assert(ingest(p,buf,maxLen,32000,decoded));
 printf("Blaze UART native CRC/framing/limits/timeout/wrap/recovery: PASS\n");
 return 0;
}
