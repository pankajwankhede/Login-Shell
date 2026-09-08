<style>/*__APP_CSS__*/</style>

<script>/*__REACT__*/</script>
<script>/*__REACT_DOM__*/</script>

<script>
window.intellijBridge = {
    request: function(obj) {
        return new Promise(function(resolve, reject) {

            var payload = JSON.stringify(obj || {});

            var onSuccess = function(response) {
                try {
                    var parsed =
                        typeof response === "string"
                            ? JSON.parse(response)
                            : response;

                    if (parsed && parsed.ok === false) {
                        reject(
                            new Error(
                                parsed.error ||
                                "Engineering AI bridge error"
                            )
                        );
                        return;
                    }

                    resolve(
                        parsed && parsed.data !== undefined
                            ? parsed.data
                            : parsed
                    );

                } catch (e) {
                    reject(e);
                }
            };

            var onError = function(errorCode, errorMessage) {
                reject(
                    new Error(
                        errorMessage ||
                        ("Bridge error " + errorCode)
                    )
                );
            };

            /*__JAVA_BRIDGE__*/
        });
    }
};
</script>

<script>/*__APP_JS__*/</script>
