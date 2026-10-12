<?php

session_start();

require_once __DIR__ . "/config/api.php";
require_once __DIR__ . "/config/ai.php";

// Use GEMINI_API_KEY from environment if available
if (empty($apiKey) || getenv('GEMINI_API_KEY')) {
    $apiKey = getenv('GEMINI_API_KEY') ?: $apiKey;
}

/*
|--------------------------------------------------------------------------
| Login Check
|--------------------------------------------------------------------------
*/

if (!isset($_SESSION["user_id"])) {
    header("Location: login.php");
    exit();
}

/*
|--------------------------------------------------------------------------
| Only POST Request
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

$language = trim($_POST["language"] ?? "");
$explanation_language = trim($_POST["explanation_language"] ?? "");
$code = $_POST["code"] ?? "";

if (
    empty($language) ||
    empty($explanation_language) ||
    trim($code) === ""
) {
    die("Please enter language, explanation language and code.");
}

/*
|--------------------------------------------------------------------------
| AI Prompt
|--------------------------------------------------------------------------
*/

$prompt = "
You are an expert programming debugger and code reviewer.

Analyze the following $language code and find possible errors,
bugs, warnings and problems.

IMPORTANT:

1. Check for syntax errors.
2. Check for runtime errors.
3. Check for logical errors.
4. Check for undefined variables or functions.
5. Check for incorrect data types.
6. Check for missing brackets, semicolons or quotes.
7. Check for incorrect function usage.
8. Check for possible infinite loops.
9. Check for security problems if applicable.
10. Check for other possible problems.
11. Do not report something as an error if the code is actually correct.
12. If there are no errors, clearly say that the code appears correct.
13. Give simple explanations suitable for beginners.
14. Mention the approximate line number whenever possible.
15. Provide a corrected code snippet for important errors.
16. Explain how the error can be fixed.

Write the answer in this explanation language:

$explanation_language

Use exactly this structure:

### 🔍 Code Analysis

Give a short overall analysis.

### 📊 Status

Say one of:

✅ No obvious errors found

or

⚠️ Possible issues found

or

🔴 Errors found

### 🔴 Errors

For every actual error, provide:

**Error:**
Name of the error.

**Line:**
Mention the line number if possible.

**Problem:**
Explain what is wrong.

**Why it happens:**
Explain the reason.

**Solution:**
Explain how to fix it.

**Corrected Code:**
Show the corrected part of the code.

### 🟡 Warnings & Possible Problems

Mention problems that may not immediately produce an error but could cause problems later.

### 💡 Suggestions

Give useful improvements for the code.

### 📝 Summary

Give a short final summary.

IMPORTANT:
Do not invent errors.
If the code is correct, say so clearly.

Here is the code:

--------------------------------
$code
--------------------------------
";

/*
|--------------------------------------------------------------------------
| Gemini API URL
|--------------------------------------------------------------------------
*/

$url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";

/*
|--------------------------------------------------------------------------
| Request Data
|--------------------------------------------------------------------------
*/

$data = [

    "contents" => [

        [

            "parts" => [

                [
                    "text" => $prompt
                ]

            ]

        ]

    ],

    "generationConfig" => [

        "temperature" => 0.2,

        "maxOutputTokens" => 8192

    ]

];

/*
|--------------------------------------------------------------------------
| Convert to JSON
|--------------------------------------------------------------------------
*/

$jsonData = json_encode(
    $data,
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);

if ($jsonData === false) {
    die("Unable to prepare AI request.");
}

/*
|--------------------------------------------------------------------------
| cURL Request
|--------------------------------------------------------------------------
*/

$ch = curl_init($url);

curl_setopt_array($ch, [

    CURLOPT_POST => true,

    CURLOPT_RETURNTRANSFER => true,

    CURLOPT_HTTPHEADER => [

        "Content-Type: application/json",

        "x-goog-api-key: " . $apiKey

    ],

    CURLOPT_POSTFIELDS => $jsonData,

    CURLOPT_CONNECTTIMEOUT => 30,

    CURLOPT_TIMEOUT => 180,

    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1

]);

/*
|--------------------------------------------------------------------------
| Execute
|--------------------------------------------------------------------------
*/

$response = curl_exec($ch);

/*
|--------------------------------------------------------------------------
| cURL Error
|--------------------------------------------------------------------------
*/

if ($response === false) {

    $error = curl_error($ch);

    curl_close($ch);

    die(
        "AI connection error. Please try again.<br><br>" .
        htmlspecialchars($error)
    );
}

/*
|--------------------------------------------------------------------------
| Get HTTP Status
|--------------------------------------------------------------------------
*/

$httpCode = curl_getinfo(
    $ch,
    CURLINFO_HTTP_CODE
);

curl_close($ch);

/*
|--------------------------------------------------------------------------
| Decode Response
|--------------------------------------------------------------------------
*/

$result = json_decode(
    $response,
    true
);

/*
|--------------------------------------------------------------------------
| Check API Error
|--------------------------------------------------------------------------
*/

if (
    isset($result["error"])
) {

    $errorCode =
        $result["error"]["code"] ?? $httpCode;

    $errorMessage =
        $result["error"]["message"] ??
        "Unknown API error";

    ?>

    <!DOCTYPE html>

    <html>

    <head>

        <title>Code Analysis Error</title>

        <link
            rel="stylesheet"
            href="css/style.css"
        >

    </head>

    <body>

    <div class="container">

        <h1>🔍 Code Analyzer</h1>

        <div class="result-card">

            <h2>Unable to Analyze Code</h2>

            <?php if ($errorCode == 429): ?>

                <p>
                    ⚠️ AI usage limit reached.
                </p>

                <p>
                    Please wait for some time and try again.
                </p>

            <?php elseif ($errorCode == 503): ?>

                <p>
                    ⚠️ AI service is temporarily busy.
                </p>

                <p>
                    Please try again after a few seconds.
                </p>

            <?php elseif (
                $errorCode == 401 ||
                $errorCode == 403
            ): ?>

                <p>
                    🔑 There is a problem with the API key.
                </p>

            <?php else: ?>

                <p>
                    Something went wrong while analyzing
                    the code.
                </p>

                <p>
                    Error:
                    <?php
                    echo htmlspecialchars(
                        $errorMessage,
                        ENT_QUOTES,
                        "UTF-8"
                    );
                    ?>
                </p>

            <?php endif; ?>

        </div>

        <br>

        <a href="dashboard.php">

            <button type="button">
                ← Back to Dashboard
            </button>

        </a>

    </div>

    </body>

    </html>

    <?php

    exit();
}

/*
|--------------------------------------------------------------------------
| Get AI Text
|--------------------------------------------------------------------------
*/

$analysis = "";

if (
    isset(
        $result["candidates"][0]["content"]["parts"]
    )
) {

    foreach (
        $result["candidates"][0]["content"]["parts"]
        as $part
    ) {

        if (isset($part["text"])) {

            $analysis .= $part["text"];

        }

    }

}

/*
|--------------------------------------------------------------------------
| Empty Response
|--------------------------------------------------------------------------
*/

if (trim($analysis) === "") {

    die("
        <h2>No analysis received.</h2>
        <a href='dashboard.php'>← Try Again</a>
    ");
}

/*
|--------------------------------------------------------------------------
| Format Markdown
|--------------------------------------------------------------------------
*/

function formatAnalysis($text)
{
    /*
    |--------------------------------------------------------------------------
    | Escape HTML
    |--------------------------------------------------------------------------
    */

    $text = htmlspecialchars(
        $text,
        ENT_QUOTES,
        "UTF-8"
    );

    /*
    |--------------------------------------------------------------------------
    | Headings
    |--------------------------------------------------------------------------
    */

    $text = preg_replace(
        '/^### (.+)$/m',
        '<h3>$1</h3>',
        $text
    );

    /*
    |--------------------------------------------------------------------------
    | Bold
    |--------------------------------------------------------------------------
    */

    $text = preg_replace(
        '/\*\*(.+?)\*\*/s',
        '<strong>$1</strong>',
        $text
    );

    /*
    |--------------------------------------------------------------------------
    | Inline Code
    |--------------------------------------------------------------------------
    */

    $text = preg_replace(
        '/`([^`]+)`/',
        '<code>$1</code>',
        $text
    );

    /*
    |--------------------------------------------------------------------------
    | Code Blocks
    |--------------------------------------------------------------------------
    */

    $text = preg_replace_callback(
        '/```(?:[a-zA-Z0-9+#]*)\s*(.*?)```/s',
        function ($matches) {

            return
                '<pre class="code-block">' .
                htmlspecialchars(
                    $matches[1],
                    ENT_QUOTES,
                    "UTF-8"
                ) .
                '</pre>';

        },
        $text
    );

    /*
    |--------------------------------------------------------------------------
    | Horizontal Line
    |--------------------------------------------------------------------------
    */

    $text = preg_replace(
        '/^---$/m',
        '<hr>',
        $text
    );

    /*
    |--------------------------------------------------------------------------
    | Bullet Points
    |--------------------------------------------------------------------------
    */

    $text = preg_replace(
        '/^\* (.+)$/m',
        '• $1',
        $text
    );

    /*
    |--------------------------------------------------------------------------
    | New Lines
    |--------------------------------------------------------------------------
    */

    $text = nl2br($text);

    return $text;
}

?>

<!DOCTYPE html>

<html>

<head>

    <title>Code Error Analysis</title>

    <link
        rel="stylesheet"
        href="css/style.css"
    >

    <style>

        .analysis-card {
            margin-top: 25px;
            padding: 25px;
            text-align: left;
            background: #ffffff;
            border-radius: 12px;
        }

        .analysis-result {
            line-height: 1.7;
            font-size: 16px;
        }

        .analysis-result h3 {
            margin-top: 25px;
        }

        .analysis-result code {
            padding: 3px 6px;
            border-radius: 5px;
        }

        .code-block {
            padding: 15px;
            overflow-x: auto;
            border-radius: 8px;
            white-space: pre-wrap;
        }

        .original-code {
            margin-top: 20px;
        }

    </style>

</head>

<body>

<div class="container">

    <h1>🔍 Code Error Analyzer</h1>

    <p>
        <strong>Programming Language:</strong>

        <?php
        echo htmlspecialchars(
            $language,
            ENT_QUOTES,
            "UTF-8"
        );
        ?>
    </p>

    <p>
        <strong>Explanation Language:</strong>

        <?php
        echo htmlspecialchars(
            $explanation_language,
            ENT_QUOTES,
            "UTF-8"
        );
        ?>
    </p>

    <div class="analysis-card">

        <h2>🔍 Analysis Result</h2>

        <div class="analysis-result">

            <?php
            echo formatAnalysis($analysis);
            ?>

        </div>

    </div>

    <div class="original-code">

        <h2>💻 Your Code</h2>

        <pre class="code-block"><?php
            echo htmlspecialchars(
                $code,
                ENT_QUOTES,
                "UTF-8"
            );
        ?></pre>

    </div>

    <br>

    <a href="dashboard.php">

        <button type="button">
            ← Back to Dashboard
        </button>

    </a>

    <a href="history.php">

        <button type="button">
            History
        </button>

    </a>

</div>

</body>

</html>