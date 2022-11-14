/* eslint-disable no-console */
import commander from 'commander'
import { HubSpace } from './hubspace'

const program = new commander.Command()

let hs = new HubSpace({
  username: 'person@example.com',
  password: 'areallygoodpassword',
})

program.name('Hubspace CLI').description('A CLI for testing Hubspace library').version('0.0.1')

program
  .command('get')
  .description('Get a device function state')
  .argument('<device_name>', 'Device Name')
  .argument('[function_name]', 'Function Name (like "power")')
  .action(async (deviceName, functionName) => {
    await hs.login()
    if (!functionName) {
      console.log(JSON.stringify(await hs.getDeviceFunctionStates(deviceName), null, 4))
    } else {
      console.log(JSON.stringify(await hs.getDeviceFunctionState(deviceName, functionName), null, 4))
    }
  })

program
  .command('set')
  .description('Set a device function state')
  .argument('<device_name>', 'Device Name')
  .argument('<function_name>', 'Function Name (like "power")')
  .argument('<value>', 'Value to set')
  .action(async (deviceName, functionName, value) => {
    let state = await hs.setDeviceFunctionState(deviceName, functionName, value)
    console.log(JSON.stringify(state, null, 4))
  })

program
  .command('list')
  .description('list all devices')
  .action(async () => {
    let state = await hs.getMetaDeviceInfo()
    console.log(JSON.stringify(state, null, 4))
  })

program.parse()
