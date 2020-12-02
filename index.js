const util = require("util");
const modbus = require("./app")
const plugin = require("ih-plugin-api")();



(async()=>{
    plugin.log("Modbus Master plugin has started.");
    try {
        modbus.params = await plugin.params.get();
        modbus.channels = await plugin.channels.get();
        
        if (modbus.channels.length > 0) {
            plugin.log(`Received ${modbus.channels.length} channels...`);
          } else {
            plugin.log('Empty channels list!');
            //process.exit(2);
          }
      
          await modbus.start(plugin);
    } catch (err) {
        plugin.exit(8, `Error! Message: ${util.inspect(err)}`);
    }
    
    
})()






