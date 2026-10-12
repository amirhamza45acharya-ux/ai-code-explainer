<?php
session_start();

if (!isset($_SESSION["user_id"])) {
    header("Location: login.php");
    exit();
}
?>

<!DOCTYPE html>
<html>

<head>
    <title>AI Code Explainer</title>
    <link rel="stylesheet" href="css/style.css">
    <script src="js/theme.js"></script>
</head>

<body>

<div class="container">

    <h1>AI Code Explainer</h1>

    <p>
        Welcome,
        <?php echo htmlspecialchars($_SESSION["user_name"]); ?> 👋
    </p>

    <hr>

    <h2>Explain & Analyze Your Code</h2>

    <form method="POST" action="explain.php">

        <div class="options">

            <div>
                <label>Programming Language</label>

                <select name="language" required>
                    <option value="">Select Language</option>
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                    <option value="java">Java</option>
                    <option value="cpp">C++</option>
                    <option value="c">C</option>
                    <option value="php">PHP</option>
                    <option value="html">HTML</option>
                    <option value="css">CSS</option>
                    <option value="sql">SQL</option>
                </select>
            </div>

            <div>
                <label>Explanation Language</label>

                <select name="explanation_language" required>
                    <option value="">Select Explanation Language</option>
                    <option value="english">English</option>
                    <option value="hindi">Hindi</option>
                    <option value="marathi">Marathi</option>
                    <option value="hinglish">Hinglish</option>
                </select>
            </div>

        </div>

        <div class="editor-layout">

            <div class="editor-box">

                <h3>Your Code</h3>

                <textarea
                    id="code"
                    name="code"
                    placeholder="Paste your code here..."
                    required
                ></textarea>

            </div>

        </div>

        <!-- Existing Explain Button -->

        <button type="submit">
            🤖 Explain Code
        </button>

    </form>

    <br>

    <!-- Error Analyzer -->

    <form method="POST" action="analyze.php">

        <input
            type="hidden"
            name="language"
            id="analyze_language"
        >

        <input
            type="hidden"
            name="explanation_language"
            id="analyze_explanation_language"
        >

        <input
            type="hidden"
            name="code"
            id="analyze_code"
        >

        <button
            type="submit"
            onclick="prepareAnalysis()"
        >
            🔍 Analyze Code for Errors
        </button>

    </form>

    <br>

    <a href="history.php">
        <button type="button">
            History
        </button>
    </a>

    <a href="logout.php">
        <button type="button">
            Logout
        </button>
    </a>

</div>

<script>

function prepareAnalysis() {

    // Get values from existing form

    const language =
        document.querySelector('select[name="language"]').value;

    const explanationLanguage =
        document.querySelector(
            'select[name="explanation_language"]'
        ).value;

    const code =
        document.getElementById("code").value;

    // Put values into Analyze form

    document.getElementById("analyze_language").value =
        language;

    document.getElementById("analyze_explanation_language").value =
        explanationLanguage;

    document.getElementById("analyze_code").value =
        code;

}

</script>

</body>

</html>