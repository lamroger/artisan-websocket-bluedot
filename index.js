import { WebSocketServer } from 'ws';
import noble from '@abandonware/noble';

const PORT = 8080;
const TEMP_CHARACTERISTIC_UUID = '783f299123e04bdcac1678601bd84b39';
const DEVICE_NAME = 'BlueDOT';

const wss = new WebSocketServer({ port: PORT });

let beanTemperature = 0;

const startScanning = async () => {
  try {
    await noble.startScanningAsync();
  } catch (error) {
    console.error('Error starting scan:', error);
    setTimeout(startScanning, 5000); // Retry after 5 seconds
  }
};

noble.on('stateChange', async (state) => {
  if (state === 'poweredOn') {
    await startScanning();
  }
});

noble.on('warning', (message) => {
  console.warn('Warning:', message);
});

noble.on('discover', async (peripheral) => {
  console.log('Found device with local name:', peripheral.advertisement.localName);
  if (peripheral.advertisement.localName !== DEVICE_NAME) {
    // await peripheral.disconnectAsync();
    return;
  }

  try {
    await noble.stopScanningAsync();
    await peripheral.connectAsync();
    console.log('Connected to device with UUID:', peripheral.uuid);

    const services = await peripheral.discoverServicesAsync();
    const characteristics = await services[0].discoverCharacteristicsAsync();
    const tempCharacteristic = characteristics.find(c => c.uuid === TEMP_CHARACTERISTIC_UUID);

    if (!tempCharacteristic) {
      console.error('Temperature characteristic not found!');
      await peripheral.disconnectAsync();
      return;
    }

    await tempCharacteristic.subscribeAsync();
    tempCharacteristic.on('data', (data) => {
      const bytes = Uint8Array.from(data);
      beanTemperature =
        (bytes[1] & 0xFF) |
        ((bytes[2] & 0xFF) << 8) |
        ((bytes[3] & 0xFF) << 16) |
        ((bytes[4] & 0xFF) << 24);

      console.log(`Updated bean temperature to ${beanTemperature}`);
    });

    // Remove all listeners for 'disconnect' event before adding a new one
    peripheral.removeAllListeners('disconnect');

    peripheral.once('disconnect', () => {
      console.log('Disconnected from device:', peripheral.uuid);
      startScanning(); // Restart scanning after disconnection
    });

  } catch (error) {
    console.error('Error during discovery or connection:', error);
    startScanning(); // Retry scanning in case of an error
  }
});

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    const { command, id } = JSON.parse(data);

    if (command === 'getData') {
      const response = {
        id,
        data: {
          BT: `${beanTemperature}`,
        },
      };

      console.log(`Sending data to client: ${JSON.stringify(response)}\n`);
      ws.send(JSON.stringify(response));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});
