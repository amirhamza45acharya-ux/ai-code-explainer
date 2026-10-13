<?php

session_start();

require_once __DIR__ . '/config/api.php';
require_once __DIR__ . '/config/ai.php';

// Allow GEMINI_API_KEY from .env if present
if (empty($apiKey) || getenv('GEMINI_API_KEY')) {
    $apiKey = getenv('GEMINI_API_KEY') ?: $apiKey;
}

if (!isset($_SESSION["user_id"])) {
    header("Location: login.php");
    exit();
}

/*
|--------------------------------------------------------------------------
| Check Request
|--------------------------------------------------------------------------
*/

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    header("Location: dashboard.php");
    exit();
}

/*
|--------------------------------------------------------------------------
| Get Form Data
|--------------------------------------------------------------------------
*/

$language = $_POST["language"] ?? "";
$explanation_language = $_POST["explanation_language"] ?? "";
$code = $_POST["code"] ?? "";

if (empty($language) || empty($explanation_language) || empty($code)) {
    die("Please fill all fields.");
}

/*
|--------------------------------------------------------------------------
| AI Prompt
|--------------------------------------------------------------------------
*/

$prompt = "
You are an expert programming teacher.

Explain the following code in a simple and beginner-friendly way.

Programming Language: $language

Explanation Language: $explanation_language

Code:

$code

Please include:

1. What the code does
2. Line-by-line explanation
3. Important concepts used
4. Expected output

Use Markdown formatting where appropriate.
";

/*
|--------------------------------------------------------------------------
| Gemini API URL
|--------------------------------------------------------------------------
*/

$candidateModels = [
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-flash-latest'
];

$data = [
    "contents" => [
        [
            "parts" => [
                [
                    "text" => $prompt
                ]
            ]
        ]
    ]
];

$explanation = null;
$lastError = "";

foreach ($candidateModels as $model) {
    $url = "https://generativelanguage.googleapis.com/v1beta/models/" . $model . ":generateContent";
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Content-Type: application/json",
        "x-goog-api-key: " . $apiKey
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($response !== false) {
        $result = json_decode($response, true);
        if (isset($result["candidates"][0]["content"]["parts"][0]["text"])) {
            $explanation = $result["candidates"][0]["content"]["parts"][0]["text"];
            break;
        } else {
            $lastError = $result["error"]["message"] ?? "Error generating explanation";
        }
    }
}

if (!$explanation) {
    die("AI Service Error: " . htmlspecialchars($lastError ?: "The AI model is currently busy. Please try again."));
}

} else {

    $errorCode = $result["error"]["code"] ?? 0;
    $errorMessage = $result["error"]["message"] ?? "Unknown API error";

    ?>

    <!DOCTYPE html>
    <html>

    <head>
        <title>AI Error - Code Explainer</title>
        <link rel="stylesheet" href="css/style.css">
    </head>

    <body>

    <div class="container">

        <div class="result-card">

            <h2>AI Explanation Unavailable</h2>

            <?php if ($errorCode == 429): ?>

                <p>
                    You have temporarily reached the AI usage limit.
                </p>

                <p>
                    Please try again later.
                </p>

            <?php elseif ($errorCode == 503): ?>

                <p>
                    The AI service is temporarily busy.
                </p>

                <p>
                    Please wait a few seconds and try again.
                </p>

            <?php else: ?>

                <p>
                    Something went wrong while generating the explanation.
                </p>

                <p>
                    Error:
                    <?php echo htmlspecialchars($errorMessage); ?>
                </p>

            <?php endif; ?>

            <br>

            <a href="dashboard.php">
                <button type="button">
                    ← Try Again
                </button>
            </a>

        </div>

    </div>

    </body>

    </html>

    <?php

    exit();
}

/*
|--------------------------------------------------------------------------
| Save Explanation in MongoDB Atlas (via Backend API)
|--------------------------------------------------------------------------
*/

$user_id = $_SESSION["user_id"];

callBackendApi('history/save', 'POST', [
    'user_id' => $user_id,
    'language' => $language,
    'explanation_language' => $explanation_language,
    'code' => $code,
    'explanation' => $explanation
]);

/*
|--------------------------------------------------------------------------
| Markdown Formatter
|--------------------------------------------------------------------------
*/

function formatExplanation($text)
{
    /*
    | Remove escaped Markdown characters
    */

    $text = str_replace('\###', '###', $text);
    $text = str_replace('\*\*', '**', $text);
    $text = str_replace('\`', '`', $text);
    $text = str_replace('\---', '---', $text);

    /*
    | Escape HTML for security
    */

    $text = htmlspecialchars(
        $text,
        ENT_QUOTES,
        'UTF-8'
    );

    /*
    | Headings
    */

    $text = preg_replace(
        '/^### (.+)$/m',
        '<h3>$1</h3>',
        $text
    );

    /*
    | Bold
    */

    $text = preg_replace(
        '/\*\*(.+?)\*\*/s',
        '<strong>$1</strong>',
        $text
    );

    /*
    | Inline Code
    */

    $text = preg_replace(
        '/`([^`]+)`/',
        '<code>$1</code>',
        $text
    );

    /*
    | Horizontal Line
    */

    $text = preg_replace(
        '/^---$/m',
        '<hr>',
        $text
    );

    /*
    | New Lines
    */

    $text = nl2br($text);

    return $text;
}

?>

<!DOCTYPE html>
<html>

<head>

    <title>AI Code Explanation</title>

    <link
        rel="stylesheet"
        href="css/style.css"
    >
    <script src="js/theme.js"></script>

</head>

<body>

<div class="container">

    <h1>AI Code Explanation 🤖</h1>

    <p>
        Programming Language:
        <strong>
            <?php
            echo htmlspecialchars($language);
            ?>
        </strong>
    </p>

    <p>
        Explanation Language:
        <strong>
            <?php
            echo htmlspecialchars($explanation_language);
            ?>
        </strong>
    </p>

    <div class="result-card">

        <h2>Your Code</h2>

        <pre class="code-block"><?php
            echo htmlspecialchars($code);
        ?></pre>

        <h2>AI Explanation</h2>

        <div class="explanation">

            <?php
            echo formatExplanation($explanation);
            ?>

        </div>

    </div>

    <div class="result-actions">

        <a href="dashboard.php">
            <button type="button">
                ← Explain Another
            </button>
        </a>

        <a href="history.php">
            <button type="button">
                History
            </button>
        </a>

    </div>

</div>

</body>

</html>