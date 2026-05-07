<?php
// ==========================================
// BULLET PH - API CAPTCHA SOLVER (CAPMONSTER)
// AUTO-DETECT TUNGGAL / MASSAL
// ==========================================
header('Content-Type: application/json');
error_reporting(0); // Matikan error agar JSON tetap bersih
set_time_limit(0);  // Mencegah PHP timeout (Batas waktu tak terhingga)

$API_KEY = "50631b384d9931bb2b33f51a38af66ef";
$WEB_KEY = "fef5c67c39074e9d845f4bf579cc07af";
$WEB_URL = "https://checkton.online";

// Fungsi Helper CURL
function request($url, $data = null) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 40);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);
    if ($data) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }
    $res = curl_exec($ch);
    curl_close($ch);
    return json_decode($res, true);
}

// --- LOGIC AUTO-DETECT SINGLE / MASSAL ---
$input = json_decode(file_get_contents('php://input'), true);
$count = 1;
$isMassal = false;

// Deteksi dari Body JSON
if (is_array($input)) {
    if (isset($input[0])) { // Jika dikirim format array [{...}, {...}]
        $count = count($input);
        $isMassal = true;
    } elseif (isset($input['count'])) { // Jika dikirim JSON {"count": 5}
        $count = (int)$input['count'];
        $isMassal = true;
    }
}
// Deteksi dari Parameter URL (?count=5)
if (isset($_GET['count'])) {
    $count = (int)$_GET['count'];
    $isMassal = true;
}

// Batasi maksimal request sekaligus agar server aman
if ($count > 20) $count = 20;
if ($count < 1) {
    $count = 1;
    $isMassal = false;
}

// --- 1. CREATE TASKS ---
$tasks = []; // Menyimpan data task yang sedang diproses
for ($i = 0; $i < $count; $i++) {
    $create = request("https://api.capmonster.cloud/createTask", [
        "clientKey" => $API_KEY,
        "task" => [
            "type" => "YidunTask",
            "websiteURL" => $WEB_URL,
            "websiteKey" => $WEB_KEY
        ]
    ]);

    if (isset($create['taskId'])) {
        $tasks[] = [
            'taskId' => $create['taskId'],
            'token' => null,
            'error' => null
        ];
    } else {
        $tasks[] = [
            'taskId' => null,
            'token' => null,
            'error' => "Gagal membuat tugas di CapMonster",
            'code' => $create['errorCode'] ?? "UNKNOWN"
        ];
    }
}

// --- 2. POLLING (MENUNGGU JAWABAN AI BERSAMAAN) ---
// Kita coba maksimal 25 kali (25 x 3 detik = 75 detik)
$max_attempts = 25;
for ($attempt = 0; $attempt < $max_attempts; $attempt++) {
    $all_done = true; // Anggap semua selesai, sampai terbukti ada yang belum
    
    foreach ($tasks as &$task) {
        // Jika task ini sudah dapat token atau error, lewati (tidak perlu dicek lagi)
        if ($task['token'] !== null || $task['error'] !== null || $task['taskId'] === null) {
            continue;
        }
        
        $all_done = false; // Ada task yang masih butuh diproses

        $result = request("https://api.capmonster.cloud/getTaskResult", [
            "clientKey" => $API_KEY,
            "taskId" => $task['taskId']
        ]);

        if (isset($result['status']) && $result['status'] == 'ready') {
            $task['token'] = $result['solution']['token'] ?? "";
        } elseif (isset($result['errorId']) && $result['errorId'] !== 0) {
            $task['error'] = "AI CapMonster mengalami gangguan (Kode: " . $result['errorCode'] . ")";
        }
    }

    // Jika semua task sudah mendapatkan hasil (token/error), hentikan loop
    if ($all_done) {
        break;
    }
    
    // Tunggu 3 detik sebelum mengecek ulang
    sleep(3);
}

// --- 3. FORMAT HASIL AKHIR ---
$final_output = [];
$tokens_to_save = []; // Array untuk menyimpan ke txt

foreach ($tasks as $task) {
    if ($task['token']) {
        $final_output[] = [
            "status" => "success",
            "cn31" => $task['token'],
            "taskId" => $task['taskId']
        ];
        $tokens_to_save[] = $task['token'];
    } elseif ($task['error']) {
        $final_output[] = [
            "status" => "error",
            "message" => $task['error'],
            "code" => $task['code'] ?? ""
        ];
    } else {
        $final_output[] = [
            "status" => "error",
            "message" => "Waktu habis (AI Timeout > 75 detik)",
            "taskId" => $task['taskId']
        ];
    }
}

// Simpan token ke cn31.txt (Setiap token dipisah dengan baris baru jika massal)
if (!empty($tokens_to_save)) {
    file_put_contents('cn31.txt', implode(PHP_EOL, $tokens_to_save));
}

// Outputkan Response
if ($isMassal) {
    echo json_encode($final_output, JSON_PRETTY_PRINT);
} else {
    // Jika tunggal, keluarkan objek pertama saja agar strukturnya seperti dulu
    echo json_encode($final_output[0], JSON_PRETTY_PRINT);
}
