export default async function handler(req, res) {
    // ==========================================
    // BULLET PH - API CAPTCHA SOLVER (CAPMONSTER)
    // AUTO DETECT TUNGGAL / MASSAL
    // ==========================================
    const API_KEY = "50631b384d9931bb2b33f51a38af66ef";
    const WEB_KEY = "fef5c67c39074e9d845f4bf579cc07af";
    const WEB_URL = "https://checkton.online";

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const solveCaptcha = async () => {
        try {
            // 1. Create Task
            const createReq = await fetch("https://api.capmonster.cloud/createTask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clientKey: API_KEY,
                    task: {
                        type: "YidunTask",
                        websiteURL: WEB_URL,
                        websiteKey: WEB_KEY
                    }
                })
            });
            const create = await createReq.json();

            if (!create.taskId) {
                return { status: "error", message: "Gagal membuat tugas di CapMonster", code: create.errorCode || "UNKNOWN" };
            }

            const taskId = create.taskId;
            let token = "";

            // 2. Polling (Menunggu Jawaban AI)
            for (let i = 0; i < 15; i++) {
                await sleep(3000); // Delay 3 detik
                const resultReq = await fetch("https://api.capmonster.cloud/getTaskResult", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ clientKey: API_KEY, taskId: taskId })
                });
                const result = await resultReq.json();

                if (result.status === 'ready') {
                    token = result.solution?.token || "";
                    break;
                }
                
                if (result.errorId !== 0) {
                    return { status: "error", message: "AI CapMonster mengalami gangguan", code: result.errorCode };
                }
            }

            // 3. Response Akhir
            if (token) {
                return { status: "success", cn31: token, taskId: taskId };
            } else {
                return { status: "error", message: "Waktu habis (AI Timeout)" };
            }
        } catch (error) {
            return { status: "error", message: "Terjadi kesalahan server", detail: error.message };
        }
    };

    // --- DETEKSI OTOMATIS ---
    
    // Jika request method POST dan body berbentuk Array (contoh payload: [{}, {}, {}]) -> PROSES MASSAL
    if (req.method === 'POST' && Array.isArray(req.body) && req.body.length > 0) {
        // Batasi maksimal misal 20 agar tidak timeout di Vercel
        const limit = Math.min(req.body.length, 20); 
        const tasks = [];
        
        for (let i = 0; i < limit; i++) {
            tasks.push(solveCaptcha());
        }
        
        const results = await Promise.all(tasks);
        return res.status(200).json(results);
    }
    
    // Jika request biasa (GET/POST tanpa Array) -> PROSES 1 SAJA
    const singleResult = await solveCaptcha();
    return res.status(200).json(singleResult);
}
