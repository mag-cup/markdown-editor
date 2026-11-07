'use strict';
// GitHub / Qiita 方言で使う絵文字ショートコード（:name:）の辞書。
// 全種類ではなく、よく使われるものに絞っている。
window.EMOJI = Object.freeze({
  // 顔
  'smile': '😄', 'smiley': '😃', 'grinning': '😀', 'grin': '😁', 'laughing': '😆', 'satisfied': '😆',
  'joy': '😂', 'rofl': '🤣', 'sweat_smile': '😅', 'blush': '😊', 'innocent': '😇', 'wink': '😉',
  'slightly_smiling_face': '🙂', 'upside_down_face': '🙃', 'heart_eyes': '😍', 'kissing_heart': '😘',
  'yum': '😋', 'stuck_out_tongue': '😛', 'stuck_out_tongue_winking_eye': '😜', 'sunglasses': '😎',
  'nerd_face': '🤓', 'thinking': '🤔', 'neutral_face': '😐', 'expressionless': '😑', 'no_mouth': '😶',
  'smirk': '😏', 'unamused': '😒', 'roll_eyes': '🙄', 'grimacing': '😬', 'relieved': '😌',
  'pensive': '😔', 'sleepy': '😪', 'sleeping': '😴', 'mask': '😷', 'dizzy_face': '😵',
  'exploding_head': '🤯', 'cowboy_hat_face': '🤠', 'partying_face': '🥳', 'confused': '😕',
  'worried': '😟', 'frowning_face': '☹️', 'open_mouth': '😮', 'astonished': '😲', 'flushed': '😳',
  'pleading_face': '🥺', 'cry': '😢', 'sob': '😭', 'scream': '😱', 'confounded': '😖',
  'persevere': '😣', 'disappointed': '😞', 'sweat': '😓', 'weary': '😩', 'tired_face': '😫',
  'triumph': '😤', 'rage': '😡', 'pout': '😡', 'angry': '😠', 'skull': '💀', 'poop': '💩', 'hankey': '💩',
  'clown_face': '🤡', 'ghost': '👻', 'alien': '👽', 'robot': '🤖', 'see_no_evil': '🙈',
  'hear_no_evil': '🙉', 'speak_no_evil': '🙊',

  // ハート・記号
  'heart': '❤️', 'orange_heart': '🧡', 'yellow_heart': '💛', 'green_heart': '💚', 'blue_heart': '💙',
  'purple_heart': '💜', 'black_heart': '🖤', 'broken_heart': '💔', 'sparkling_heart': '💖',
  'two_hearts': '💕', '100': '💯', 'anger': '💢', 'boom': '💥', 'collision': '💥', 'dizzy': '💫',
  'sweat_drops': '💦', 'zzz': '💤', 'speech_balloon': '💬', 'thought_balloon': '💭',

  // 手・体
  'wave': '👋', 'raised_hand': '✋', 'hand': '✋', 'ok_hand': '👌', 'v': '✌️', 'crossed_fingers': '🤞',
  '+1': '👍', 'thumbsup': '👍', '-1': '👎', 'thumbsdown': '👎', 'fist': '✊', 'facepunch': '👊',
  'punch': '👊', 'clap': '👏', 'raised_hands': '🙌', 'open_hands': '👐', 'pray': '🙏', 'handshake': '🤝',
  'muscle': '💪', 'point_up': '☝️', 'point_down': '👇', 'point_left': '👈', 'point_right': '👉',
  'eyes': '👀', 'eye': '👁️', 'brain': '🧠', 'bow': '🙇', 'man_technologist': '👨‍💻',
  'woman_technologist': '👩‍💻',

  // 自然
  'sunny': '☀️', 'cloud': '☁️', 'umbrella': '☔', 'zap': '⚡', 'snowflake': '❄️', 'fire': '🔥',
  'droplet': '💧', 'ocean': '🌊', 'star': '⭐', 'star2': '🌟', 'sparkles': '✨', 'rainbow': '🌈',
  'crescent_moon': '🌙', 'earth_asia': '🌏', 'cherry_blossom': '🌸', 'rose': '🌹', 'sunflower': '🌻',
  'seedling': '🌱', 'evergreen_tree': '🌲', 'four_leaf_clover': '🍀', 'maple_leaf': '🍁',

  // 動物
  'dog': '🐶', 'cat': '🐱', 'mouse': '🐭', 'rabbit': '🐰', 'bear': '🐻', 'panda_face': '🐼', 'tiger': '🐯',
  'frog': '🐸', 'penguin': '🐧', 'bird': '🐦', 'chicken': '🐔', 'snake': '🐍', 'whale': '🐳', 'fish': '🐟',
  'octopus': '🐙', 'bug': '🐛', 'bee': '🐝', 'honeybee': '🐝', 'beetle': '🐞', 'lady_beetle': '🐞',
  'turtle': '🐢', 'crab': '🦀', 'unicorn': '🦄',

  // 食べ物
  'apple': '🍎', 'tangerine': '🍊', 'lemon': '🍋', 'banana': '🍌', 'watermelon': '🍉', 'grapes': '🍇',
  'strawberry': '🍓', 'peach': '🍑', 'cherries': '🍒', 'tomato': '🍅', 'pizza': '🍕', 'hamburger': '🍔',
  'fries': '🍟', 'sushi': '🍣', 'ramen': '🍜', 'rice': '🍚', 'bento': '🍱', 'curry': '🍛', 'cake': '🍰',
  'birthday': '🎂', 'cookie': '🍪', 'doughnut': '🍩', 'coffee': '☕', 'tea': '🍵', 'beer': '🍺',
  'beers': '🍻', 'wine_glass': '🍷',

  // 行事・趣味
  'tada': '🎉', 'confetti_ball': '🎊', 'gift': '🎁', 'balloon': '🎈', 'trophy': '🏆', 'medal_sports': '🏅',
  'soccer': '⚽', 'baseball': '⚾', 'basketball': '🏀', 'tennis': '🎾', 'video_game': '🎮', 'dart': '🎯',
  'art': '🎨', 'musical_note': '🎵', 'notes': '🎶', 'microphone': '🎤', 'headphones': '🎧',

  // 乗り物・場所
  'car': '🚗', 'taxi': '🚕', 'bus': '🚌', 'train': '🚆', 'bullettrain_side': '🚄', 'airplane': '✈️',
  'rocket': '🚀', 'ship': '🚢', 'bike': '🚲', 'house': '🏠', 'office': '🏢', 'hospital': '🏥',
  'school': '🏫', 'japan': '🗾', 'mount_fuji': '🗻', 'tokyo_tower': '🗼',

  // 物
  'watch': '⌚', 'iphone': '📱', 'computer': '💻', 'keyboard': '⌨️', 'desktop_computer': '🖥️',
  'printer': '🖨️', 'cd': '💿', 'dvd': '📀', 'floppy_disk': '💾', 'camera': '📷', 'tv': '📺',
  'telephone_receiver': '📞', 'phone': '☎️', 'battery': '🔋', 'electric_plug': '🔌', 'bulb': '💡',
  'flashlight': '🔦', 'book': '📖', 'books': '📚', 'notebook': '📓', 'memo': '📝', 'pencil': '📝',
  'pencil2': '✏️', 'pen': '🖊️', 'page_facing_up': '📄', 'clipboard': '📋', 'calendar': '📆', 'date': '📅',
  'bookmark': '🔖', 'label': '🏷️', 'pushpin': '📌', 'round_pushpin': '📍', 'paperclip': '📎',
  'scissors': '✂️', 'file_folder': '📁', 'open_file_folder': '📂', 'card_index_dividers': '🗂️',
  'chart_with_upwards_trend': '📈', 'chart_with_downwards_trend': '📉', 'bar_chart': '📊',
  'envelope': '✉️', 'email': '📧', 'e-mail': '📧', 'inbox_tray': '📥', 'outbox_tray': '📤',
  'package': '📦', 'mailbox': '📫', 'lock': '🔒', 'unlock': '🔓', 'key': '🔑', 'hammer': '🔨',
  'wrench': '🔧', 'gear': '⚙️', 'nut_and_bolt': '🔩', 'hammer_and_wrench': '🛠️', 'link': '🔗',
  'mag': '🔍', 'mag_right': '🔎', 'bell': '🔔', 'no_bell': '🔕', 'loudspeaker': '📢', 'mega': '📣',
  'hourglass': '⌛', 'hourglass_flowing_sand': '⏳', 'alarm_clock': '⏰', 'stopwatch': '⏱️',
  'moneybag': '💰', 'dollar': '💵', 'yen': '💴', 'credit_card': '💳', 'gem': '💎',

  // 標識・マーク
  'construction': '🚧', 'rotating_light': '🚨', 'warning': '⚠️', 'no_entry': '⛔', 'no_entry_sign': '🚫',
  'x': '❌', 'o': '⭕', 'heavy_check_mark': '✔️', 'white_check_mark': '✅', 'ballot_box_with_check': '☑️',
  'heavy_multiplication_x': '✖️', 'heavy_plus_sign': '➕', 'heavy_minus_sign': '➖', 'question': '❓',
  'grey_question': '❔', 'exclamation': '❗', 'heavy_exclamation_mark': '❗', 'grey_exclamation': '❕',
  'bangbang': '‼️', 'interrobang': '⁉️', 'information_source': 'ℹ️', 'recycle': '♻️', 'beginner': '🔰',
  'new': '🆕', 'free': '🆓', 'up': '🆙', 'cool': '🆒', 'ok': '🆗', 'sos': '🆘', 'ng': '🆖',
  'arrow_up': '⬆️', 'arrow_down': '⬇️', 'arrow_left': '⬅️', 'arrow_right': '➡️', 'arrow_forward': '▶️',
  'arrows_counterclockwise': '🔄', 'repeat': '🔁', 'red_circle': '🔴', 'large_blue_circle': '🔵',
  'white_circle': '⚪', 'black_circle': '⚫', 'small_red_triangle': '🔺', 'small_orange_diamond': '🔸',
  'small_blue_diamond': '🔹', 'checkered_flag': '🏁', 'triangular_flag_on_post': '🚩', 'jp': '🇯🇵',
  'us': '🇺🇸',
  'zero': '0️⃣', 'one': '1️⃣', 'two': '2️⃣', 'three': '3️⃣', 'four': '4️⃣', 'five': '5️⃣', 'six': '6️⃣',
  'seven': '7️⃣', 'eight': '8️⃣', 'nine': '9️⃣', 'keycap_ten': '🔟',
});
