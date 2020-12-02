const util = require("util");
const ModbusRTU = require("modbus-serial");
//const client = new ModbusRTU();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    params : {},
    channels : [],
    MBS_STATE: 'init',
    act: null,

    async start(plugin)
    {
        this.plugin = plugin;
        this.plugin.onAct(async message => {
            if(this.act==null){
                this.act = message
                this.MBS_STATE = 'command'
            }else{
                while (this.act!=null) {
                    this.plugin.log('wait')
                    await sleep(10)
                }
                this.plugin.log('null')
                this.act = message
                this.MBS_STATE = 'command'
            }
            
            
        });
        this.plugin.onCommand(async data => this.parseCommand(data));
        //this.plugin.onCommand(async data => this.plugin.log(data));
        this.client = new ModbusRTU();
        await this.connect();
        await this.runModbus();
    },

    async parseAct()
    {
        this.MBS_STATE = 'busy'
        for(let to_device of this.act.data){
            if(this.current_status[+to_device.id] != 0xff) await this.command(to_device)            
            await sleep(80)
        }
        this.act = null
        this.MBS_STATE = 'status'
        //this.command.data.forEach(item => this.command(item));
    },

    async parseCommand(message)
    {
        this.plugin.log(message)
    },

    async connect()
    {
        switch (this.params.transport) {
            case 'rtu':
                this.plugin.log('rtu')
                await this.client.connectRTUBuffered(this.params.serialport,{ baudRate: +this.params.baudRate })
                await this.client.setID(this.params.controllerID)
                break;

            case 'udp':
                
                break;

            case 'tcp':
                
                break;

            default:
                break;
        }

        try {
            
        } catch (error) {
            this.plugin.log(error)
            this.plugin.log(`Connection fail! EXIT`, 1);
            process.exit(1);
        }

                
        
    },

    async initStatus(){
        this.MBS_STATE = 'busy'
        //await this.client.writeRegister(0x02,0x2001)
        let devicesStatus         = await this.client.readHoldingRegisters(0x10,0x20)
        await this.plugin.log(devicesStatus.buffer)
        let switchContextTotype   = await this.client.writeRegister(0x0A,0x79)
        await sleep(3000)
        let devicesType           = await this.client.readHoldingRegisters(0x10,0x20)
        devicesType.buffer[15] = 2
        devicesType.buffer[16] = 2
        let switchContextToStatus = await this.client.writeRegister(0x0A,0x77)
        let channels = []
        for(let [i,device] of devicesStatus.buffer.entries()){
            if(device != 0xff) {
                if(devicesType.buffer[i]==1){
                    channels.push({ id:`${i}`, desc: "KPI"})
                    // channels.push({ id:`${i} Current Sensor` , desc: "KPI_AMPER"})
                    // channels.push({ id:`${i} Voltage Sensor` , desc: "KPI_VOLT"})
                    // channels.push({ id:`${i} Power Sensor`   , desc: "KPI_WATT"})
                }else if(devicesType.buffer[i]==2){
                    channels.push({ id:`${i}_in1`, desc: "IBV", linAdress:i, inNumber:1})
                    channels.push({ id:`${i}_in2`, desc: "IBV", linAdress:i, inNumber:2})
                    channels.push({ id:`${i}_in3`, desc: "IBV", linAdress:i, inNumber:3})
                    channels.push({ id:`${i}_in4`, desc: "IBV", linAdress:i, inNumber:4})
                }
                
            }
        }
        process.send({ type:'channels', data:channels })
        this.MBS_STATE = 'status'
    },

    async status()
    {
        let status = await this.client.readHoldingRegisters(0x10,0x20)
        let volts  = await this.client.readHoldingRegisters(0x50,0x20)
        let ampers = await this.client.readHoldingRegisters(0x90,0x20)
        let temp = {}
        temp[1]    = await this.client.readHoldingRegisters(0x0110,0x20)
        temp[2]    = await this.client.readHoldingRegisters(0x0150,0x20)
        temp[3]    = await this.client.readHoldingRegisters(0x0190,0x20)
        temp[4]    = await this.client.readHoldingRegisters(0x01D0,0x20)
        this.current_status = status.buffer
        let realtimeData = []
        let realtimeDataAlarm = []


        let kpi = (channel)=>{
            if(status.buffer[channel.linAdress]==0xff){
                realtimeData.push({"id":`${channel.id}`, "err":1, "ext":{volt:'offline',amper:'offline',watt:'offline'}})
                // realtimeData.push({"id":`${channel.id} Current Sensor`, "err":1})
                // realtimeData.push({"id":`${channel.id} Voltage Sensor`, "err":1})
                // realtimeData.push({"id":`${channel.id} Power Sensor`,   "err":1})
                return
            }

            let device_state = 0;
            if(status.buffer[channel.id] & 0b00000001) device_state = 1
            this.plugin.log(channel.id + '   ' +status.buffer[channel.id].toString(2));
            this.plugin.log(device_state)
            let v = volts.buffer[channel.id]
            let a = +`${(ampers.buffer[channel.id] & 0b11110000)>>4}.${ampers.buffer[channel.id] & 0b00001111}`
            let w = Math.round(v*a)
            if((status.buffer[channel.id] & 0b00001000) || (status.buffer[channel.id] & 0b00010000) || (status.buffer[channel.id] & 0b00100000)){
                // realtimeData.push({"id":`${channel.id}`, "err":1})
                realtimeData.push({"id":`${channel.id}`, "value":device_state, "ext":{volt:v,amper:a,watt:w}})
                realtimeDataAlarm.push({"id":`${channel.id}`, "err":1 })
                
            }else{
                realtimeData.push({"id":`${channel.id}`, "value":device_state, "ext":{volt:v,amper:a,watt:w}})
            }            
            

            // realtimeData.push({"id":`${channel.id} Current Sensor`, "value":a})
            // realtimeData.push({"id":`${channel.id} Voltage Sensor`, "value":v})
            // realtimeData.push({"id":`${channel.id} Power Sensor`,   "value":w})
        }


        let ibv = function(channel){
            if(status.buffer[channel.linAdress]==0xff){
                realtimeData.push({"id":`${channel.linAdress}_in${channel.inNumber}`, "err":1})
                return
            }
            let mask = 0b00000010
            if(channel.inNumber == 2) mask = mask << 2;
            if(channel.inNumber == 3) mask = mask << 4;
            if(channel.inNumber == 4) mask = mask << 5;
            realtimeData.push({ "id":`${channel.linAdress}_in${channel.inNumber}`, "value":mask & status.buffer[channel.linAdress] ? 1 : 0 })
        }


        let ibv_temperature = async (channel)=>{
            this.plugin.log(channel)
            if(status.buffer[channel.linAdress]==0xff){
                realtimeData.push({"id":`${channel.linAdress}_in${channel.inNumber}`, "err":1})
                return
            }
            let temperature = temp[channel.inNumber].buffer[channel.linAdress];
            let t = Int8Array.of(temperature)
            realtimeData.push({"id":`${channel.linAdress}_in${channel.inNumber}`, "value":t[0]})
        }

        for (const channel of this.channels) {
            this.plugin.log(channel)
            switch (channel.desc) {
                case 'KPI':
                    kpi(channel)
                    break;
                case 'IBV':
                    ibv(channel)
                    break;
                case 'IBV_TEMP':
                    ibv_temperature(channel)
                    break;
                default:
                    break;
            }
            
        }

        process.send({ type:'data', data: realtimeData })
        process.send({ type:'data', data: realtimeDataAlarm })

    },

    async command(device){
       let id = +device.id

       if(this.current_status[id] || 0b00111010){                                           //Ручной или аварийный режим
        await this.client.writeRegister(0x10+id, device.command=='on' ? 0x0000 : 0x0001 )
        //await sleep(50)
        await this.client.writeRegister(0x10+id, device.command=='on' ? 0x0001 : 0x0000 )
       }else{
        await this.client.writeRegister(0x10+id, device.command=='on' ? 0x0001 : 0x0000 )
       }  

       

    },

    async runModbus()
    {
        //this.plugin.log(this.MBS_STATE)
        switch (this.MBS_STATE) {
            case 'init':
                this.initStatus()
                break;
            case 'status':
                this.status()
                break;
            case 'command':
                this.parseAct()
                break;
            case 'busy':
                this.plugin.log('busy')
                break;
        
            default:
                break;
        }

        setTimeout(()=>{ this.runModbus() }, 400)
    }


}