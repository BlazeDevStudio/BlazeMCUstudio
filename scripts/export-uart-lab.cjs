#!/usr/bin/env node
'use strict';
// Export the independently compiled, inert ESP32 initiator / ESP8266 responder.
// Source-only: no GPIO changes, uploads, hardware, wiring or production claims.
const {demos}=require('../core/uart-pair-sketches.cjs');
const {exportSketches}=require('../core/uart-sketch-output.cjs');

const written=exportSketches(process.argv[2],demos,{collisionLabel:'UART lab demo'});
for(const {name,fqbn,sketch} of written){
 console.log(JSON.stringify({
  name,fqbn,sketch,header:'BlazeUartFrame.h',
  kind:'inert-ping-pong',wireApproval:false
 }));
}
