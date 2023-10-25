import { WebSocketServer } from 'ws';
import noble from '@abandonware/noble'

const wss = new WebSocketServer({ port: 8080 });

let beanTemperature = 0;
const TEMP_CHARACTERISTIC_UUID = '783f299123e04bdcac1678601bd84b39';

noble.on('stateChange', async (state) => {
  if (state === 'poweredOn') {
    await noble.startScanningAsync();
  }
});

noble.on('discover', async (peripheral) => {
  console.log('Found device with local name: ' + peripheral.advertisement.localName);
  if (peripheral.advertisement.localName !== 'BlueDOT') {
    await peripheral.disconnectAsync();
    return
  };

  await noble.stopScanningAsync();
  await peripheral.connectAsync();
  console.log('Connected to device with UUID: ' + peripheral.uuid);

  const services = await peripheral.discoverServicesAsync();

  const characteristics = await services[0].discoverCharacteristicsAsync();
  const tempCharacteristic = characteristics.find(c => c.uuid === TEMP_CHARACTERISTIC_UUID);

  tempCharacteristic.notify(true, (error) => {
    console.log(error)
  })

  tempCharacteristic.on('data', (data, isNotification) => {
    var bytes = Uint8Array.from(data)

    beanTemperature =
      (bytes[1] & 0xFF) |
      ((bytes[2] & 0xFF) << 8) |
      ((bytes[3] & 0xFF) << 16) |
      ((bytes[4] & 0xFF) << 24);

    console.log(`Updated bean temperature to ${beanTemperature}`)
  });
});


wss.on('connection', function connection(ws) {
  ws.on('message', function message(data) {
    const { command, id } = JSON.parse(data)

    if (command === 'getData') {
      const response = {
        id,
        data: {
          BT: `${beanTemperature}`,
        }
      }

      ws.send(JSON.stringify(response));
    }
  });
});
