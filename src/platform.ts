import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge'

import { PLATFORM_NAME, PLUGIN_NAME } from './settings'
import { HubspacePlatformAccessory } from './platformAccessory'
import { HubSpace } from './hubspace'

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class HubspaceHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service
  public readonly Characteristic: typeof Characteristic

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = []

  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    this.Characteristic = this.api.hap.Characteristic
    this.Service = this.api.hap.Service

    this.log.debug('Finished initializing platform:', this.config.name)

    this.config = config

    if (!config.username || !config.password) {
      this.log.error('Username or password not set in config')
      return
    }

    this.api.on('didFinishLaunching', async () => {
      log.debug('Executed didFinishLaunching callback')
      // run the method to discover / register your devices as accessories
      this.discoverDevices()
    })
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName)
    this.accessories.push(accessory)
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    // EXAMPLE ONLY
    // A real plugin you would discover accessories from the local network, cloud services
    // or a user-defined array in the platform config.
    let hs = new HubSpace({
      username: this.config.username as string,
      password: this.config.password as string,
      refreshToken: this.config.refreshToken as string,
      accountId: this.config.accountId as string,
    })
    await hs.login()
    this.config.refreshToken = hs.refreshToken
    this.config.accountId = hs.accountId
    const devices = await hs.getMetaDeviceInfo()

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of devices) {
      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find((accessory) => accessory.UUID === device.id)

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName)

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        // existingAccessory.context.device = device;
        // this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new HubspacePlatformAccessory(this, existingAccessory)

        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
        // remove platform accessories when no longer present
        // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.friendlyName)

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.friendlyName, device.id)

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device

        // create the accessory handler for the newly created accessory
        // this is imported from `platformAccessory.ts`
        new HubspacePlatformAccessory(this, accessory)

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
      }
    }
  }
}
