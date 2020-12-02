const ModbusRTU = require("modbus-serial");
const client = new ModbusRTU
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


client.connectRTUBuffered('/dev/ttyS0', {baudRate: 57600});
client.setID(0x01);

setTimeout(()=>{
	client.writeRegister(0x02,0x2001)
},1000)
