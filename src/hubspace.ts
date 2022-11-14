import axios from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
import { URLSearchParams } from 'url'

axios.defaults.withCredentials = true
const cookieJar = new CookieJar()
const client = wrapper(axios.create({ jar: cookieJar }))

const AUTH_ERROR = 'Not authenticated, you must call login() first'

export class HubSpace {
  private readonly username: string
  private readonly password: string
  refreshToken: string
  accountId: string
  authenticated: boolean

  constructor(config: HubSpaceConfig) {
    this.username = config.username
    this.password = config.password
    this.refreshToken = config.refreshToken ?? ''
    this.accountId = config.accountId ?? ''
    this.authenticated = false

    if (this.refreshToken && this.accountId) {
      this.authenticated = true
    }
  }

  async login() {
    if (!this.refreshToken || !this.accountId) {
      this.refreshToken = await this.getRefreshToken()
      this.accountId = await this.getAccountId()
    }
    this.authenticated = true
  }

  private async getRefreshToken() {
    const oidcAuthResp = await client.get('https://accounts.hubspaceconnect.com/auth/realms/thd/protocol/openid-connect/auth', {
      params: {
        response_type: 'code',
        client_id: 'hubspace_android',
        redirect_uri: 'hubspace-app://loginredirect',
        code_challenge: '-mOIrXE66x4ozP_s8wYn_l5ov1e8hzQGVoObDtti20c',
        code_challenge_method: 'S256',
        scope: 'openid offline_access',
      },
    })

    const sessionCode = oidcAuthResp.data.match(/session_code=([^&]+)/)[1]
    const execution = oidcAuthResp.data.match(/execution=([^&]+)/)[1]
    const tabId = oidcAuthResp.data.match(/tab_id=([^&]+)/)[1]

    const loginResp = await client.post(
      'https://accounts.hubspaceconnect.com/auth/realms/thd/login-actions/authenticate',
      new URLSearchParams({
        username: this.username,
        password: this.password,
      }),
      {
        params: {
          session_code: sessionCode,
          execution,
          client_id: 'hubspace_android',
          tab_id: tabId,
        },
        maxRedirects: 0,
        validateStatus: (status) => status === 302,
      },
    )

    const sessionStateMatch = loginResp.headers.location?.match(/session_state=([^&]+)/)
    const sessionCodeMatch = loginResp.headers.location?.match(/code=([^&]+)/)
    if (!sessionStateMatch || !sessionCodeMatch) {
      throw new Error('Failed to login')
    }
    const sessionState = sessionStateMatch[1]
    const sessionCode2 = sessionCodeMatch[1]

    const { data: refreshCodeResp } = await client.post(
      'https://accounts.hubspaceconnect.com/auth/realms/thd/protocol/openid-connect/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'hubspace_android',
        code_verifier:
          's27y9Tyc-s-XkNlhY_0KBaA7DDgirvHhoJM6TA8ZPRcjaA4ApKPF.5bIQogmUD.E5M_fWpW_M~eVNR_hxBMWE5oncrKo2cI-qp9U8wloSu9ERL60dAqBu9IKeUawNDFi',
        code: sessionCode2,
        redirect_uri: 'hubspace-app://loginredirect',
      }),
    )

    return refreshCodeResp.refresh_token as string
  }

  private async getAccessToken() {
    const { data } = await client.post(
      'https://accounts.hubspaceconnect.com/auth/realms/thd/protocol/openid-connect/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'hubspace_android',
        scope: 'openid email offline_access profile',
        refresh_token: this.refreshToken,
      }),
    )

    return data.access_token
  }

  async getAccountInfo() {
    const token = await this.getAccessToken()
    const { data } = await axios.get('https://api2.afero.net/v1/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return data
  }

  private async getAccountId() {
    const accountInfo = await this.getAccountInfo()
    return accountInfo.accountAccess[0].account.accountId
  }

  async getMetaDeviceInfo() {
    if (!this.authenticated) throw new Error(AUTH_ERROR)
    const token = await this.getAccessToken()
    const { data } = await axios.get(`https://api2.afero.net/v1/accounts/${this.accountId}/metadevices?expansions=state`, {
      headers: {
        Authorization: `Bearer ${token}`,
        host: 'semantics2.afero.net',
      },
    })
    return data.filter((device) => device.typeId === 'metadevice.device')
  }

  async getDeviceByName(deviceName: string) {
    const metaDeviceInfo: HubSpaceDevice[] = await this.getMetaDeviceInfo()
    const device = metaDeviceInfo.find((device) => device.friendlyName === deviceName)
    if (!device) {
      throw new Error('Device not found')
    }
    return device
  }

  getDeviceFunctions(device: HubSpaceDevice) {
    return device.description.functions
  }

  getDeviceFunction(device: HubSpaceDevice, functionClass: string) {
    return device.description.functions.find((f) => f.functionClass === functionClass)
  }

  async getDeviceFunctionStates(deviceName: string) {
    const device = await this.getDeviceByName(deviceName)
    return {
      id: device.id,
      metadeviceId: device.state.metadeviceId,
      states: device.state.values,
    }
  }

  async getDeviceFunctionState(deviceName: string, functionClass: string) {
    const resp = await this.getDeviceFunctionStates(deviceName)
    return {
      id: resp.id,
      metadeviceId: resp.metadeviceId,
      state: resp.states.find((s) => s.functionClass === functionClass),
    }
  }

  async setDeviceFunctionState(deviceName: string, functionClass: string, value: any) {
    const deviceFunctionState = await this.getDeviceFunctionState(deviceName, functionClass)
    const token = await this.getAccessToken()
    const { data } = await axios.put(
      `https://api2.afero.net/v1/accounts/${this.accountId}/metadevices/${deviceFunctionState.id}/state`,
      {
        metadeviceId: deviceFunctionState.metadeviceId,
        values: [
          {
            functionClass,
            value,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          host: 'semantics2.afero.net',
        },
      },
    )
    return {
      id: deviceFunctionState.id,
      metadeviceId: deviceFunctionState.metadeviceId,
      state: data.values.find((s) => s.functionClass === functionClass),
    }
  }
}

export interface HubSpaceConfig {
  username: string
  password: string
  refreshToken?: string
  accountId?: string
}

export interface HubSpaceDevice {
  id: string
  createdTimestampMs: number
  updatedTimestampMs: number
  version: number
  typeId: string
  friendlyName: string
  friendlyDescription: string
  locale: string
  image: string
  tag: string
  description: {
    id: string
    createdTimestampMs: number
    updatedTimestampMs: number
    version: number
    device: {
      defaultName: string
      manufacturerName: string
      model: string
      type: string
      deviceClass: string
      profileId: string
    }
    defaultImage: string
    functions: {
      id: string
      createdTimestampMs: number
      updatedTimestampMs: number
      functionClass: string
      type: string
      schedulable: boolean
      values: {
        id: string
        createdTimestampMs: number
        updatedTimestampMs: number
        name: string
        deviceValues: {
          id: string
          createdTimestampMs: number
          updatedTimestampMs: number
          type: string
          key: string
          value?: string
          format?: string
        }[]
        range: {
          min?: number
          max?: number
          step?: number
        }
      }[]
      functionInstance?: string
    }[]
    descriptions: any[]
  }
  deviceId: string
  children: any[]
  state: {
    metadeviceId: string
    values: {
      functionClass: string
      value: any
      lastUpdateTime: number
      functionInstance?: string
    }[]
  }
}
