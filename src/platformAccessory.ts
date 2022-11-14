import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge'
import { HubSpace, HubSpaceConfig } from './hubspace'

import { HubspaceHomebridgePlatform } from './platform'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class HubspacePlatformAccessory {
  private service: Service
  private hsConfig: HubSpaceConfig

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private state = {
    on: false,
    brightness: 100,
    mode: '',
    rgb: [0, 0, 0],
  }

  constructor(private readonly platform: HubspaceHomebridgePlatform, private readonly accessory: PlatformAccessory) {
    this.hsConfig = {
      username: this.platform.config.username,
      password: this.platform.config.password,
      refreshToken: this.platform.config.refreshToken,
      accountId: this.platform.config.accountId,
    }
    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, this.accessory.context.device.description.device.manufacturerName)
      .setCharacteristic(this.platform.Characteristic.Model, this.accessory.context.device.description.device.model)

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb)

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.friendlyName)

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this)) // SET - bind to the `setOn` method below
      .onGet(this.getOn.bind(this)) // GET - bind to the `getOn` method below

    // register handlers for the Brightness Characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setBrightness.bind(this))
      .onGet(this.getBrightness.bind(this))

    // this.service.getCharacteristic(this.platform.Characteristic.Hue).onSet(this.setHue.bind(this))
    // this.service.getCharacteristic(this.platform.Characteristic.Saturation).onSet(this.setSaturation.bind(this))

    /**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same sub type id.)
     */

    // // Example: add two "motion sensor" services to the accessory
    // const motionSensorOneService =
    //   this.accessory.getService('Motion Sensor One Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor One Name', 'YourUniqueIdentifier-1')

    // const motionSensorTwoService =
    //   this.accessory.getService('Motion Sensor Two Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor Two Name', 'YourUniqueIdentifier-2')

    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */
    // let motionDetected = false
    // setInterval(() => {
    //   // EXAMPLE - inverse the trigger
    //   motionDetected = !motionDetected

    //   // push the new value to HomeKit
    //   motionSensorOneService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected)
    //   motionSensorTwoService.updateCharacteristic(this.platform.Characteristic.MotionDetected, !motionDetected)

    //   this.platform.log.debug('Triggering motionSensorOneService:', motionDetected)
    //   this.platform.log.debug('Triggering motionSensorTwoService:', !motionDetected)
    // }, 10000)
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn(value: CharacteristicValue) {
    const hs = new HubSpace(this.hsConfig)
    await hs.setDeviceFunctionState(this.accessory.context.device.friendlyName, 'power', value ? 'on' : 'off')
    this.state.on = value as boolean
    this.platform.log.debug('Set Characteristic On ->', value)
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async getOn(): Promise<CharacteristicValue> {
    const h = new HubSpace(this.hsConfig)
    const currentState = await h.getDeviceFunctionState(this.accessory.context.device.friendlyName, 'power')
    const isOn = currentState.state?.value === 'on' ? true : false

    this.platform.log.debug('Get Characteristic On ->', isOn)

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return isOn
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, changing the Brightness
   */
  async setBrightness(value: CharacteristicValue) {
    const h = new HubSpace(this.hsConfig)
    if (value === 0) {
      return
    }
    await h.setDeviceFunctionState(this.accessory.context.device.friendlyName, 'brightness', value as number)
    this.state.brightness = value as number

    this.platform.log.debug('Set Characteristic Brightness -> ', value)
  }

  async getBrightness(): Promise<CharacteristicValue> {
    const h = new HubSpace(this.hsConfig)
    const currentState = await h.getDeviceFunctionState(this.accessory.context.device.friendlyName, 'brightness')
    const brightness = currentState.state?.value

    this.platform.log.debug('Get Characteristic Brightness -> ', brightness)

    return brightness
  }

  // async setHue(value: CharacteristicValue) {
  //   this.platform.log.debug('Hue Set -> ', value)
  // }

  // async setSaturation(value: CharacteristicValue) {
  //   this.platform.log.debug('Saturation Set -> ', value)
  // }
}
