package com.anonymous.songbookapp.pedaldevice

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class PedalDeviceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val PREFS_NAME = "pedal_device_prefs"
    private const val KEY_VENDOR_ID = "active_pedal_vendor_id"
    private const val KEY_PRODUCT_ID = "active_pedal_product_id"
    private const val KEY_DEVICE_NAME = "active_pedal_device_name"

    @Volatile private var cachedVendorId: Int = 0
    @Volatile private var cachedProductId: Int = 0
    @Volatile private var cachedDeviceName: String? = null
    @Volatile private var loaded = false

    // reactApplicationContext ist in BaseJavaModule PROTECTED - von außen
    // (z.B. aus MainActivity.kt) nicht zugreifbar, auch nicht über eine
    // Instanzreferenz. Deshalb hält dieses Modul selbst eine Referenz auf
    // seine eigene (einzige) Instanz und kapselt den Zugriff hier in
    // sendPedalKeyEvent() - MainActivity ruft nur noch diese öffentliche
    // statische Methode auf.
    @Volatile private var instance: PedalDeviceModule? = null

    private fun ensureLoaded(context: Context) {
      if (loaded) return
      synchronized(this) {
        if (loaded) return
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        cachedVendorId = prefs.getInt(KEY_VENDOR_ID, 0)
        cachedProductId = prefs.getInt(KEY_PRODUCT_ID, 0)
        cachedDeviceName = prefs.getString(KEY_DEVICE_NAME, null)
        loaded = true
      }
    }

    /**
     * Von MainActivity.dispatchKeyEvent aufgerufen: true, wenn das
     * übergebene Gerät genau das in den Einstellungen zugewiesene aktive
     * Pedal ist. Ohne zugewiesenes Pedal (cachedDeviceName == null) immer
     * false - dann wird nichts konsumiert (Standardverhalten, jedes Gerät
     * läuft normal durch).
     */
    @JvmStatic
    fun matchesActiveDevice(context: Context, vendorId: Int, productId: Int, deviceName: String?): Boolean {
      ensureLoaded(context)
      val activeName = cachedDeviceName ?: return false
      if (cachedVendorId != 0 || cachedProductId != 0) {
        return vendorId == cachedVendorId && productId == cachedProductId
      }
      return deviceName == activeName
    }

    /**
     * Von MainActivity.dispatchKeyEvent aufgerufen: meldet ein KeyEvent
     * inkl. Gerätemetadaten per DeviceEventEmitter als "onPedalKeyEvent" an
     * JS (siehe usePedalCapture.js). Kapselt den Zugriff auf den (in
     * BaseJavaModule protected) ReactContext der eigenen Modul-Instanz -
     * ohne aktive Instanz (Modul noch nicht initialisiert) oder ohne aktive
     * Catalyst-Instanz passiert nichts.
     */
    @JvmStatic
    fun sendPedalKeyEvent(
      deviceName: String,
      deviceId: Int,
      vendorId: Int,
      productId: Int,
      keyCode: Int,
      action: String,
      keyName: String,
      isPhysicalDevice: Boolean
    ) {
      val reactContext = instance?.reactApplicationContext ?: return
      if (!reactContext.hasActiveCatalystInstance()) return

      val params = Arguments.createMap()
      params.putString("deviceName", deviceName)
      params.putInt("deviceId", deviceId)
      params.putInt("vendorId", vendorId)
      params.putInt("productId", productId)
      params.putInt("keyCode", keyCode)
      params.putString("action", action)
      params.putString("keyName", keyName)
      params.putBoolean("isPhysicalDevice", isPhysicalDevice)
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("onPedalKeyEvent", params)
    }
  }

  init {
    instance = this
  }

  override fun getName(): String = "PedalDeviceModule"

  @ReactMethod
  fun setActivePedalDevice(vendorId: Int, productId: Int, deviceName: String) {
    cachedVendorId = vendorId
    cachedProductId = productId
    cachedDeviceName = deviceName
    loaded = true
    reactApplicationContext
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putInt(KEY_VENDOR_ID, vendorId)
      .putInt(KEY_PRODUCT_ID, productId)
      .putString(KEY_DEVICE_NAME, deviceName)
      .apply()
  }

  @ReactMethod
  fun clearActivePedalDevice() {
    cachedVendorId = 0
    cachedProductId = 0
    cachedDeviceName = null
    loaded = true
    reactApplicationContext
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .clear()
      .apply()
  }
}
