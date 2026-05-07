<?php
// ==========================================
// BULLET PH - API CAPTCHA SOLVER (CAPMONSTER)
// ULTRA FAST (CURL MULTI) & AUTO-DETECT
// ==========================================
header('Content-Type: application/json');
error_reporting(0); // Matikan error agar JSON bersih
set_time_limit(0);

$API_KEY = "50631b384d9931bb2b33f51a38af66ef";
$WEB_KEY = "fef5c67c39074e9d845f4bf579cc07af";
$WEB_URL = "https://checkton.online";

// --- FUNGSI HELPER PARALEL (CURL MULTI) ---
// Ini yang bikin proses massal jadi secepat kilat tanpa antre
function multi_request($requests) {
    $mh = curl_multi_init();
    $handles = [];
    $results = [];

    foreach ($requests as $id => $req) {
        $ch = curl_init($req['url']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);
        if (!empty($req['data'])) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($req['data']));
        }
        curl_multi_add_handle($mh, $ch);
        $handles[$id] = $ch;
    }

    $running = null;
    do {
        curl_multi_exec($mh, $running);
        curl_multi_select($mh);
    } while ($running > 0);

    foreach ($handles as $id => $ch) {
        $results[$id] = json_decode(curl_multi_getcontent($ch), true);
        curl_multi_remove_handle($mh, $ch);
    }
    curl_multi_close($mh);
    
    return $results;
}

// --- LOGIC AUTO-DETECT ---
$input = json_decode(file_get_contents('php://input'), true);
$count = 1;
$isMassal = false;

if (is_array($input)) {
    if (isset($input[0])) { 
        $count = count($input); $isMassal = true;
    } elseif (isset($input['count'])) { 
        $count = (int)$input['count']; $isMassal = true;
    }
}
if (isset($_GET['count'])) {
    $count = (int)$_GET['count']; $isMassal = true;
}

if ($count > 30) $count = 30; // Limit dinaikkan ke 30 karena sekarang prosesnya cepat
if ($count < 1) { $count = 1; $isMassal = false; }

// --- 1. CREATE TASKS (SECARA BERSAMAAN) ---
$create_requests = [];
for ($i = 0; $i < $count; $i++) {
    $create_requests[$i] = [
        'url' => "https://api.capmonster.cloud/createTask",
        'data' => [
            "clientKey" => $API_KEY,
            "task" => ["type" => "YidunTask", "websiteURL" => $WEB_URL, "websiteKey" => $WEB_KEY]
        ]
    ];
}

// Tembak semua API Create Task sekaligus dalam hitungan milidetik
$create_responses = multi_request($create_requests);

$tasks = [];
foreach ($create_responses as $i => $res) {
    if (isset($res['taskId'])) {
        $tasks[$i] = ['taskId' => $res['taskId'], 'token' => null, 'error' => null];
    } else {
        $tasks[$i] = ['taskId' => null, 'token' => null, 'error' => "Gagal membuat tugas", 'code' => $res['errorCode'] ?? "UNKNOWN"];
    }
}

// --- 2. POLLING BERSAMAAN (MENUNGGU HASIL) ---
$max_attempts = 35; // Maksimal coba 35 kali
$sleep_time = 2;    // Jeda dipercepat jadi 2 detik (Total max tunggu: 70 detik)

for ($attempt = 0; $attempt < $max_attempts; $attempt++) {
    $check_requests = [];
    
    // Kumpulkan task yang belum selesai
    foreach ($tasks as $i => $task) {
        if ($task['token'] === null && $task['error'] === null && $task['taskId'] !== null) {
            $check_requests[$i] = [
                'url' => "https://api.capmonster.cloud/getTaskResult",
                'data' => ["clientKey" => $API_KEY, "taskId" => $task['taskId']]
            ];
        }
    }

    // Jika sudah tidak ada task yang perlu dicek, hentikan loop
    if (empty($check_requests)) {
        break;
    }

    // Tembak pengecekan untuk semua task sekaligus
    $check_responses = multi_request($check_requests);

    foreach ($check_responses as $i => $res) {
        if (isset($res['status']) && $res['status'] == 'ready') {
            $tasks[$i]['token'] = $res['solution']['token'] ?? "";
        } elseif (isset($res['errorId']) && $res['errorId'] !== 0) {
            $tasks[$i]['error'] = "AI Gangguan (Kode: " . $res['errorCode'] . ")";
        }
    }

    // Tunggu 2 detik sebelum mengecek ulang (dipercepat dari 3 detik)
    sleep($sleep_time); 
}

// --- 3. FORMAT HASIL AKHIR ---
$final_output = [];
$tokens_to_save = [];

foreach ($tasks as $task) {
    if ($task['token']) {
        $final_output[] = ["status" => "success", "cn31" => $task['token'], "taskId" => $task['taskId']];
        $tokens_to_save[] = $task['token'];
    } elseif ($task['error']) {
        $final_output[] = ["status" => "error", "message" => $task['error']];
    } else {
        $final_output[] = ["status" => "error", "message" => "Waktu habis (AI Timeout)"];
    }
}

// Simpan ke txt
if (!empty($tokens_to_save)) {
    file_put_contents('cn31.txt', implode(PHP_EOL, $tokens_to_save));
}

// Output
if ($isMassal) {
    echo json_encode($final_output, JSON_PRETTY_PRINT);
} else {
    echo json_encode($final_output[0], JSON_PRETTY_PRINT);
}
