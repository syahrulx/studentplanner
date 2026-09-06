require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'SmartCapture'
  s.version        = package['version']
  s.summary        = 'On-device OCR and the Back Tap capture inbox for Rencana.'
  s.description    = 'Vision-based text recognition plus the App Group inbox written by the Plan from screenshot App Intent.'
  s.license        = package['license']
  s.author         = 'Aizz Tech Solutions'
  s.homepage       = 'https://aizztech.com'
  s.platforms      = {
    :ios => '16.2'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'UIKit'

  # NOTE: scoped to this directory on purpose. The App Intent lives in
  # ../ios-app-target/ and must be compiled into the MAIN app target (see
  # plugins/withSmartCapture.js) — App Intents in a pod are not discovered by
  # the Shortcuts app.
  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
