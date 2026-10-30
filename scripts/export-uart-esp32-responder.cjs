#!/usr/bin/env node
'use strict';
// Export the independently compiled second ESP32 UART1 responder, source-only.
const {esp32Responder}=require('../core/uart-pair-sketches.cjs');
const {exportSketches}=require('../core/uart-sketch-output.cjs');

const [written]=exportSketches(process.argv[2],[esp32Responder],{
 collisionLabel:'ESP32 UART responder'
});
console.log(JSON.stringify({
 name:written.name,fqbn:written.fqbn,
 gpio:{tx:'25',rx:'26'},file:written.sketch,
 physicalLinkVerified:false,hardwareFlashed:false
}));
