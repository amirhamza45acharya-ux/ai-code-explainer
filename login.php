<?php

error_reporting(E_ALL);
ini_set('display_errors', 1);

session_start();

require_once __DIR__ . '/config/api.php';

// Redirect if already logged in
if (isset($_SESSION["user_id"])) {
    header("Location: dashboard.php");
    exit();
}

$message = "";

/*
|--------------------------------------------------------------------------
| Handle Google Sign-In (AJAX POST)
|--------------------------------------------------------------------------
*/
if ($_SERVER["REQUEST_METHOD"] === "POST" && isset($_POST["action"]) && $_POST["action"] === "google_login") {
    header('Content-Type: application/json');
    $credential = trim($_POST["credential"] ?? "");

    if (empty($credential)) {
        echo json_encode(["success" => false, "message" => "Missing Google credential."]);
        exit();
    }

    $result = callBackendApi('auth/google', 'POST', [
        "credential" => $credential
    ]);

    if (!empty($result["success"]) && !empty($result["user"])) {
        $_SESSION["user_id"] = $result["user"]["id"];
        $_SESSION["user_name"] = $result["user"]["name"];
        $_SESSION["user_email"] = $result["user"]["email"];

        echo json_encode(["success" => true, "redirect" => "dashboard.php"]);
        exit();
    } else {
        $errorMsg = $result["message"] ?? "Google authentication failed.";
        echo json_encode(["success" => false, "message" => $errorMsg]);
        exit();
    }
}

/*
|--------------------------------------------------------------------------
| Handle Standard Email / Password Login
|--------------------------------------------------------------------------
*/
if ($_SERVER["REQUEST_METHOD"] === "POST" && (!isset($_POST["action"]) || $_POST["action"] !== "google_login")) {

    $email = trim($_POST["email"] ?? "");
    $password = $_POST["password"] ?? "";

    if (empty($email) || empty($password)) {
        $message = "Please enter email and password.";
    } else {
        $result = callBackendApi('auth/login', 'POST', [
            "email" => $email,
            "password" => $password
        ]);

        if (!empty($result["success"]) && !empty($result["user"])) {
            $_SESSION["user_id"] = $result["user"]["id"];
            $_SESSION["user_name"] = $result["user"]["name"];
            $_SESSION["user_email"] = $result["user"]["email"];

            header("Location: dashboard.php");
            exit();
        } else {
            $message = $result["message"] ?? "Invalid login credentials.";
        }
    }
}

?>
<!DOCTYPE html>
<html>

<head>
    <title>Login - AI Code Explainer</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="css/style.css">
    
    <!-- Google Identity Services Library -->
    <script src="https://accounts.google.com/gsi/client" async defer></script>
    
    <style>
        .auth-divider {
            display: flex;
            align-items: center;
            text-align: center;
            margin: 18px 0;
            color: #888;
        }
        .auth-divider::before,
        .auth-divider::after {
            content: '';
            flex: 1;
            border-bottom: 1px solid #ddd;
        }
        .auth-divider span {
            padding: 0 10px;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .google-btn-wrapper {
            display: flex;
            justify-content: center;
            margin-bottom: 10px;
        }
    </style>
</head>

<body>

<div class="auth-container">

    <div class="auth-card">

        <h1>AI Code Explainer</h1>

        <p>Login to your account</p>

        <?php if (!empty($message)): ?>
            <p style="color: red; margin-bottom: 15px;">
                <?php echo htmlspecialchars($message); ?>
            </p>
        <?php endif; ?>

        <!-- Google Sign-In Button -->
        <?php if (!empty($googleClientId)): ?>
            <div id="g_id_onload"
                 data-client_id="<?php echo htmlspecialchars($googleClientId); ?>"
                 data-callback="handleGoogleSignIn"
                 data-auto_prompt="false">
            </div>

            <div class="google-btn-wrapper">
                <div class="g_id_signin"
                     data-type="standard"
                     data-size="large"
                     data-theme="outline"
                     data-text="sign_in_with"
                     data-shape="rectangular"
                     data-logo_alignment="left"
                     data-width="320">
                </div>
            </div>

            <div class="auth-divider">
                <span>OR</span>
            </div>
        <?php endif; ?>

        <!-- Standard Email / Password Form -->
        <form method="POST">

            <label>Email</label>
            <input
                type="email"
                name="email"
                placeholder="Enter your email"
                required
            >

            <label>Password</label>
            <input
                type="password"
                name="password"
                placeholder="Enter your password"
                required
            >

            <button type="submit">
                Login
            </button>

        </form>

        <div class="auth-link">
            Don't have an account?
            <a href="register.php">
                Register
            </a>
        </div>

    </div>

</div>

<script>
function handleGoogleSignIn(response) {
    if (!response || !response.credential) {
        alert("Google sign in failed. Please try again.");
        return;
    }

    const formData = new URLSearchParams();
    formData.append("action", "google_login");
    formData.append("credential", response.credential);

    fetch("login.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData.toString()
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            window.location.href = data.redirect || "dashboard.php";
        } else {
            alert(data.message || "Google authentication failed.");
        }
    })
    .catch(err => {
        console.error("Auth error:", err);
        alert("Network error connecting to login service.");
    });
}
</script>

</body>

</html>