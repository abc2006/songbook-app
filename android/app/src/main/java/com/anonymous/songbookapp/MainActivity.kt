package com.anonymous.songbookapp
// @generated begin react-native-keyevent-imports - expo prebuild (DO NOT MODIFY) sync-a441aab7cbb9e7141532a0754bc73b044fd83b45
import android.view.KeyEvent
import com.github.kevinejohn.keyevent.KeyEventModule
import com.anonymous.songbookapp.pedaldevice.PedalDeviceModule
// @generated end react-native-keyevent-imports

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
// @generated begin react-native-keyevent-methods - expo prebuild (DO NOT MODIFY) sync-eeea97f38f27a64486b37032a1c2d8b18759c13c

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val action = event.action
    if (action != KeyEvent.ACTION_DOWN && action != KeyEvent.ACTION_UP) {
      return super.dispatchKeyEvent(event)
    }

    val device = event.device
    val isPhysicalDevice = device != null && !device.isVirtual
    val actionName = if (action == KeyEvent.ACTION_DOWN) "DOWN" else "UP"
    val deviceName = device?.name ?: "Unknown"
    val vendorId = device?.vendorId ?: 0
    val productId = device?.productId ?: 0
    val keyName = KeyEvent.keyCodeToString(event.keyCode)

    PedalDeviceModule.sendPedalKeyEvent(
      deviceName, event.deviceId, vendorId, productId, event.keyCode, actionName, keyName, isPhysicalDevice
    )

    val keyEventModule = KeyEventModule.getInstance()
    if (action == KeyEvent.ACTION_DOWN) {
      keyEventModule?.onKeyDownEvent(event.keyCode, event)
    } else {
      keyEventModule?.onKeyUpEvent(event.keyCode, event)
    }

    val isActivePedal = isPhysicalDevice && PedalDeviceModule.matchesActiveDevice(this, vendorId, productId, deviceName)
    return if (isActivePedal) true else super.dispatchKeyEvent(event)
  }
// @generated end react-native-keyevent-methods
}
